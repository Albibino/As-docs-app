import { AiIndexingService, PendingPage } from './ai-indexing.service';

const page = (overrides: Partial<PendingPage> = {}): PendingPage => ({
  id: '11111111-1111-4111-8111-111111111111',
  workspaceId: 'w1',
  spaceId: 's1',
  title: 'Política de férias',
  content: {
    type: 'doc',
    content: [
      { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Prazo' }] },
      { type: 'paragraph', content: [{ type: 'text', text: 'Pedir com 45 dias.' }] },
    ],
  },
  contentVersion: 3,
  deletedAt: null,
  ...overrides,
});

function setup(results: unknown[] = []) {
  const executed: string[] = [];
  const db = {
    getExecutor: () => ({
      transformQuery: (node: any) => node,
      compileQuery: (node: any) => ({ sql: '', parameters: [], query: node }),
      executeQuery: async () => ({ rows: [] }),
    }),
  };
  const environment = {
    isDocsAiConfigured: () => true,
    getDocsAiUrl: () => 'http://ai.test',
    getDocsAiHmacSecret: () => 'secret',
    getAiIndexIntervalSeconds: () => 0,
  };
  const service = new AiIndexingService(db as any, environment as any);
  const markIndexed = jest
    .spyOn(service, 'markIndexed')
    .mockImplementation(async (r) => {
      executed.push(JSON.stringify(r));
    });
  const fetchMock = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ results }),
  });
  (global as any).fetch = fetchMock;
  return { service, fetchMock, markIndexed };
}

describe('AiIndexingService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends only the current version, as Markdown with headings', () => {
    const { service } = setup();
    const payload = service.toIndexPayload(page());
    expect(payload).toMatchObject({
      pageId: page().id,
      version: 3,
      title: 'Política de férias',
      deleted: false,
    });
    expect(payload.text).toContain('## Prazo');
    expect(payload.text).toContain('Pedir com 45 dias.');
  });

  it('sends a deleted page as a tombstone version without text', () => {
    const { service } = setup();
    const payload = service.toIndexPayload(page({ deletedAt: new Date() }));
    expect(payload).toMatchObject({ deleted: true, text: '', version: 3 });
  });

  it('signs the request and marks the confirmed versions as indexed', async () => {
    const results = [{ pageId: page().id, version: 3, status: 'indexed' }];
    const { service, fetchMock, markIndexed } = setup(results);

    await expect(service.indexPages('w1', [page()])).resolves.toBe(1);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('http://ai.test/v1/index/pages');
    expect(init.headers['x-ai-signature']).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({
      tenantId: 'w1',
      pages: [{ pageId: page().id, version: 3 }],
    });
    expect(markIndexed).toHaveBeenCalledWith(results);
  });

  it('does not advance the marker when the AI service fails', async () => {
    const { service, fetchMock, markIndexed } = setup();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(service.indexPages('w1', [page()])).rejects.toThrow('503');
    expect(markIndexed).not.toHaveBeenCalled();
  });
});
