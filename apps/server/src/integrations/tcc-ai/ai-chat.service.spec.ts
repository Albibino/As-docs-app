import { AiChatService, ChatClientEvent } from './ai-chat.service';
import { AiHttpClient } from './ai-http-client.service';
import { OidcProviderService } from '../oidc/oidc-provider.service';

const PAGE_ID = '11111111-1111-4111-8111-111111111111';
const CHAT_ID = '33333333-3333-4333-8333-333333333333';
const user = { id: 'u1', workspaceId: 'w1' } as any;

function sseBody(events: Array<[string, unknown]>) {
  const text = events
    .map(
      ([event, data]) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
    )
    .join('');
  return new Response(text).body;
}

function setup(events: Array<[string, unknown]>, oauth = false) {
  const inserted: any[] = [];
  const environment = {
    isDocsAiConfigured: () => true,
    isDocsAiOAuthEnabled: () => oauth,
    getDocsAiOAuthSecret: () => 'test-secret',
    isAiMcpEnabled: () => true,
    getDocsAiUrl: () => 'https://ai.test',
    getDocsAiHmacSecret: () => 'secret',
  } as any;
  const provider = new OidcProviderService(environment);
  jest.spyOn(provider, 'clientCredentials').mockResolvedValue({
    access_token: 'chat-token',
    token_type: 'bearer',
    expires_in: 300,
  });
  const service = new AiChatService(
    {} as any,
    environment,
    { issue: jest.fn().mockReturnValue('mcp-credential') } as any,
    {} as any,
    new AiHttpClient(environment, provider),
  );
  // Isola o banco: conversa existente, histórico vazio, inserts registrados.
  jest.spyOn(service, 'requireChat').mockResolvedValue({ id: CHAT_ID } as any);
  jest.spyOn(service as any, 'history').mockResolvedValue([]);
  jest
    .spyOn(service, 'enrich')
    .mockImplementation(async (_user, refs) =>
      refs.map((ref) => ({ ...ref, slugId: 'slug', spaceSlug: 'documentos' })),
    );
  const insertBuilder = (values: any) => ({
    execute: async () => inserted.push(values),
    returning: () => ({
      executeTakeFirst: async () => {
        inserted.push(values);
        return { id: 'message-1' };
      },
    }),
  });
  (service as any).db = {
    insertInto: () => ({ values: insertBuilder }),
    updateTable: () => ({
      set: () => ({ where: () => ({ execute: async () => undefined }) }),
    }),
  };
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValue(new Response(sseBody(events)));
  return { service, fetchMock, inserted };
}

async function run(service: AiChatService) {
  const out: ChatClientEvent[] = [];
  await service.send(
    user,
    {
      chatId: CHAT_ID,
      content: 'Quantos dias de antecedência?',
      contextPageId: PAGE_ID,
    },
    (event) => out.push(event),
    new AbortController().signal,
  );
  return out;
}

describe('AiChatService', () => {
  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'preserves the delegated MCP credential and SSE in chat (OAuth=%s)',
    async (oauth) => {
      const { service, fetchMock, inserted } = setup(
        [
          [
            'meta',
            {
              freshnessChecked: true,
              stalePages: [
                {
                  pageId: PAGE_ID,
                  title: 'Férias',
                  indexedVersion: 1,
                  currentVersion: 2,
                },
              ],
            },
          ],
          [
            'sources',
            [
              {
                n: 1,
                pageId: PAGE_ID,
                title: 'Férias',
                version: 2,
                origin: 'mcp_read',
              },
            ],
          ],
          ['delta', { text: 'Com 45 dias [1].' }],
          ['done', { found: true }],
        ],
        oauth,
      );

      const events = await run(service);

      const [, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init.headers);
      if (oauth) {
        expect(headers.get('authorization')).toBe('Bearer chat-token');
        expect(headers.has('x-ai-signature')).toBe(false);
      } else {
        expect(headers.get('x-ai-signature')).toMatch(/^v1=[0-9a-f]{64}$/);
      }
      const body = JSON.parse(init.body as string);
      expect(body).toMatchObject({
        tenantId: 'w1',
        sessionId: CHAT_ID,
        contextPageId: PAGE_ID,
        mcpCredential: 'mcp-credential',
      });
      expect(events.map((event) => event.type)).toEqual([
        'freshness',
        'sources',
        'content',
        'done',
      ]);
      expect(events[1]).toMatchObject({
        sources: [{ origin: 'mcp_read', version: 2, spaceSlug: 'documentos' }],
      });
      expect(events[3]).toMatchObject({ found: true, messageId: 'message-1' });
      const assistant = inserted.find((row) => row.role === 'assistant');
      expect(assistant.content).toBe('Com 45 dias [1].');
      expect(JSON.parse(assistant.metadata).stalePages).toHaveLength(1);
    },
  );

  it('turns not_found into an empty answer with similar pages', async () => {
    const { service, inserted } = setup([
      ['meta', { freshnessChecked: true, stalePages: [] }],
      [
        'not_found',
        { similar: [{ pageId: PAGE_ID, title: 'Férias', score: 0.6 }] },
      ],
      ['done', { found: false }],
    ]);

    const events = await run(service);

    expect(events.map((event) => event.type)).toEqual([
      'freshness',
      'not_found',
      'done',
    ]);
    expect(events[1]).toMatchObject({
      similar: [{ pageId: PAGE_ID, slugId: 'slug' }],
    });
    expect(events[2]).toMatchObject({ found: false });
    const assistant = inserted.find((row) => row.role === 'assistant');
    expect(assistant.content).toBeNull();
  });

  it('reports an upstream error without persisting an answer', async () => {
    const { service, inserted } = setup([
      ['error', { code: 'model_unavailable' }],
    ]);
    const events = await run(service);
    expect(events).toEqual([
      expect.objectContaining({ type: 'error', code: 'model_unavailable' }),
    ]);
    expect(inserted.some((row) => row.role === 'assistant')).toBe(false);
  });

  it('rejects empty questions before calling the AI service', () => {
    const { service } = setup([]);
    expect(() => service.validate({ content: '   ' })).toThrow(
      'Invalid question',
    );
  });
});
