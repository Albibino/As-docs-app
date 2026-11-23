import { createHash, createHmac } from 'node:crypto';
import { AssistedWritingService } from './assisted-writing.service';
import { AiHttpClient } from '../tcc-ai/ai-http-client.service';
import { OidcProviderService } from '../oidc/oidc-provider.service';

describe('AssistedWritingService', () => {
  const secret = 's'.repeat(32);
  const environment = {
    isDocsAiConfigured: () => true,
    isDocsAiOAuthEnabled: () => false,
    getDocsAiOAuthSecret: () => 'test-secret',
    getDocsAiUrl: () => 'https://ai.staging.example',
    getDocsAiHmacSecret: () => secret,
  } as any;
  const provider = new OidcProviderService(environment);
  beforeEach(() => {
    jest.spyOn(provider, 'clientCredentials').mockResolvedValue({
      access_token: 'writing-token',
      token_type: 'bearer',
      expires_in: 300,
    });
  });
  const ai = new AiHttpClient(environment, provider);
  const service = new AssistedWritingService(
    environment,
    {} as any,
    {} as any,
    {} as any,
    ai,
  );
  const input = {
    pageId: 'page-1',
    sessionId: '11111111-1111-4111-8111-111111111111',
    request: 'Rewrite',
    blocks: [
      {
        blockId: 'p1',
        type: 'paragraph',
        hash: 'a'.repeat(64),
        editable: true,
        content: { type: 'paragraph' },
      },
    ],
  };

  it('accepts every block type the client marks editable', () => {
    // Must stay in sync with EDITABLE_BLOCK_TYPES in
    // apps/client/src/features/assisted-writing/domain/assisted-writing.ts — the client sends
    // editable: true for these, and a mismatch rejects the whole page.
    const clientEditableTypes = [
      'paragraph',
      'heading',
      'bulletList',
      'orderedList',
      'taskList',
      'table',
    ];
    for (const type of clientEditableTypes) {
      expect(() =>
        service.validateInput({
          ...input,
          blocks: [
            {
              blockId: 'b1',
              type,
              hash: 'a'.repeat(64),
              editable: true,
              content: { type },
            },
          ],
        } as any),
      ).not.toThrow();
    }
  });

  afterEach(() => jest.restoreAllMocks());

  it.each([false, true])(
    'authenticates the exact forwarded body (OAuth=%s)',
    async (oauth) => {
      jest.spyOn(environment, 'isDocsAiOAuthEnabled').mockReturnValue(oauth);
      const fetchMock = jest
        .spyOn(global, 'fetch')
        .mockResolvedValue(new Response('ok'));
      await service.openStream(
        input,
        'workspace-server-value',
        new AbortController().signal,
      );
      const [url, init] = fetchMock.mock.calls[0];
      const headers = new Headers(init.headers);
      const body = init.body as string;
      expect(new URL(String(url)).pathname).toBe('/v1/generations/stream');
      const payload = JSON.parse(body);
      expect(payload.tenantId).toBe('workspace-server-value');
      expect(payload.pageId).toBeUndefined();
      if (oauth) {
        expect(headers.get('authorization')).toBe('Bearer writing-token');
        expect(headers.has('x-ai-signature')).toBe(false);
        return;
      }
      const timestamp = headers.get('x-ai-timestamp');
      const bodyHash = createHash('sha256').update(body).digest('hex');
      const canonical = [
        timestamp,
        'POST',
        '/v1/generations/stream',
        headers.get('idempotency-key'),
        bodyHash,
      ].join('\n');
      const expected = createHmac('sha256', secret)
        .update(canonical)
        .digest('hex');
      expect(headers.get('x-ai-signature')).toBe(`v1=${expected}`);
    },
  );

  it('rejects a client-supplied page index', () => {
    expect(() =>
      service.validateInput({
        ...input,
        spacePages: [{ pageId: 'p', slugId: 's', title: 'Secret' }],
      } as any),
    ).toThrow('spacePages is not accepted from clients');
  });

  it('forwards the page index without the slugId only the client needs', async () => {
    const spacePages = [
      { pageId: 'page-2', slugId: 'slug-2', title: 'Arquitetura' },
    ];
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('ok'));
    const signal = new AbortController().signal;
    await service.openStream(input, 'tenant', signal, spacePages);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(payload.spacePages).toEqual([
      { pageId: 'page-2', title: 'Arquitetura' },
    ]);
    await service.openStream(input, 'tenant', signal);
    expect(
      JSON.parse(fetchMock.mock.calls[1][1].body as string).spacePages,
    ).toBeUndefined();
  });

  it('retries only connection failure before a response', async () => {
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockRejectedValueOnce(new Error('connect'))
      .mockResolvedValueOnce(new Response('ok'));
    const response = await service.openStream(
      input,
      'tenant',
      new AbortController().signal,
    );
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    fetchMock.mockRestore();
  });

  it('returns upstream 422 without retry', async () => {
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response('{"error":{"code":"input_budget_exceeded"}}', {
        status: 422,
      }),
    );
    const response = await service.openStream(
      input,
      'tenant',
      new AbortController().signal,
    );
    expect(response.status).toBe(422);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fetchMock.mockRestore();
  });

  it('marks AI reference checkpoints as automatic', async () => {
    const pageHistoryRepo = {
      insertPageHistory: jest.fn().mockResolvedValue({ id: 'history-1' }),
    };
    const db = {
      getExecutor: () => ({
        transformQuery: (node: unknown) => node,
        compileQuery: (node: unknown) => node,
        executeQuery: jest.fn().mockResolvedValue({ rows: [{ id: 'app-1' }] }),
      }),
    };
    const service = new AssistedWritingService(
      environment,
      pageHistoryRepo as any,
      {} as any,
      db as any,
      ai,
    );

    await service.recordReferenceVersion(
      {
        pageId: 'page-1',
        sessionId: '11111111-1111-4111-8111-111111111111',
        content: { type: 'doc', content: [] },
        operations: [],
        beforeHashes: {},
        afterHashes: {},
      },
      {
        id: 'page-1',
        slugId: 'slug-1',
        title: 'Live title',
        icon: null,
        coverPhoto: null,
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
      } as any,
      { id: 'user-1' } as any,
    );

    expect(pageHistoryRepo.insertPageHistory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'automatic' }),
    );
  });
});
