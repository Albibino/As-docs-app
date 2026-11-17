import { createHash, createHmac } from 'node:crypto';
import { AssistedWritingService } from './assisted-writing.service';

describe('AssistedWritingService', () => {
  const secret = 's'.repeat(32);
  const environment = {
    isDocsAiConfigured: () => true,
    getDocsAiUrl: () => 'https://ai.staging.example',
    getDocsAiHmacSecret: () => secret,
  } as any;
  const service = new AssistedWritingService(
    environment,
    {} as any,
    {} as any,
    {} as any,
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

  it('derives tenant and signs exact forwarded body', () => {
    const signed = service.buildSignedRequest(input, 'workspace-server-value');
    const payload = JSON.parse(signed.body);
    expect(payload.tenantId).toBe('workspace-server-value');
    expect(payload.pageId).toBeUndefined();
    const timestamp = signed.headers['x-ai-timestamp'];
    const bodyHash = createHash('sha256').update(signed.body).digest('hex');
    const canonical = [
      timestamp,
      'POST',
      '/v1/generations/stream',
      signed.idempotencyKey,
      bodyHash,
    ].join('\n');
    const expected = createHmac('sha256', secret)
      .update(canonical)
      .digest('hex');
    expect(signed.headers['x-ai-signature']).toBe(`v1=${expected}`);
  });

  it('rejects a client-supplied page index', () => {
    expect(() =>
      service.validateInput({
        ...input,
        spacePages: [{ pageId: 'p', slugId: 's', title: 'Secret' }],
      } as any),
    ).toThrow('spacePages is not accepted from clients');
  });

  it('forwards the page index without the slugId only the client needs', () => {
    const spacePages = [
      { pageId: 'page-2', slugId: 'slug-2', title: 'Arquitetura' },
    ];
    const payload = JSON.parse(
      service.buildSignedRequest(input, 'tenant', spacePages).body,
    );
    expect(payload.spacePages).toEqual([
      { pageId: 'page-2', title: 'Arquitetura' },
    ]);
    expect(
      JSON.parse(service.buildSignedRequest(input, 'tenant').body).spacePages,
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
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
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
