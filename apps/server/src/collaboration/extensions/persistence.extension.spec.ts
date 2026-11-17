import * as Y from 'yjs';
import { TiptapTransformer } from '@hocuspocus/transformer';
import { PersistenceExtension } from './persistence.extension';
import { tiptapExtensions } from '../collaboration.util';
import { STORE_RETRY_DELAYS_MS } from '../constants';

function buildStoreExtension(
  pageRepo: Record<string, jest.Mock>,
  options?: { historyQueue?: Record<string, jest.Mock>; collabHistory?: any },
) {
  const db = {
    transaction: () => ({
      execute: async (callback: (trx: unknown) => Promise<unknown>) =>
        callback({}),
    }),
  };
  const queue = { add: jest.fn().mockResolvedValue(undefined) };
  const historyQueue =
    options?.historyQueue ??
    ({
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(undefined),
    } as any);

  return new PersistenceExtension(
    pageRepo as any,
    db as any,
    queue as any,
    historyQueue as any,
    queue as any,
    queue as any,
    (options?.collabHistory ?? {
      addContributors: jest.fn(),
      getRestorePending: jest.fn().mockResolvedValue(undefined),
    }) as any,
    {
      syncPageTransclusions: jest.fn(),
      syncPageReferences: jest.fn(),
    } as any,
  );
}

describe('PersistenceExtension post-restore history scheduling', () => {
  const page = {
    id: 'page-1',
    createdAt: new Date('2020-01-01'),
  } as any;

  it('schedules the post-restore history with a 60 second debounce', async () => {
    const historyQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    const collabHistory = {
      getRestorePending: jest.fn().mockResolvedValue({
        token: 'restore-token',
        targetRevisionId: 'revision-target',
        snapshotId: 'snapshot-before-restore',
        markedAt: Date.now(),
      }),
    };
    const extension = buildStoreExtension({}, { historyQueue, collabHistory });

    await (extension as any).enqueuePageHistory(page);

    expect(historyQueue.add).toHaveBeenCalledWith(
      'page-history',
      expect.objectContaining({
        pageId: page.id,
        restoreToken: 'restore-token',
        enqueuedAt: expect.any(Number),
        forceFast: true,
      }),
      expect.objectContaining({
        jobId: 'page-history:page-1',
        delay: 60_000,
      }),
    );
  });

  it('replaces delayed canonical and legacy jobs but keeps active work intact', async () => {
    const delayed = {
      getState: jest.fn().mockResolvedValue('delayed'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const active = {
      getState: jest.fn().mockResolvedValue('active'),
      remove: jest.fn(),
    };
    const historyQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest
        .fn()
        .mockResolvedValueOnce(delayed)
        .mockResolvedValueOnce(active),
    };
    const extension = buildStoreExtension(
      {},
      {
        historyQueue,
        collabHistory: {
          getRestorePending: jest.fn().mockResolvedValue({
            token: 'restore-token',
            targetRevisionId: 'revision-target',
            snapshotId: 'snapshot-before-restore',
            markedAt: Date.now(),
          }),
        },
      },
    );

    await (extension as any).enqueuePageHistory(page);

    expect(delayed.remove).toHaveBeenCalledTimes(1);
    expect(active.remove).not.toHaveBeenCalled();
  });
});

function buildStorePayload() {
  const document = TiptapTransformer.toYdoc(
    {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'oi' }] }],
    },
    'default',
    tiptapExtensions,
  );

  const broadcastStateless = jest.fn();
  (document as any).broadcastStateless = broadcastStateless;

  return {
    payload: {
      documentName: 'page.page-1',
      document,
      lastContext: { user: { id: 'user-1' } },
    } as any,
    broadcastStateless,
  };
}

describe('PersistenceExtension store failures', () => {
  it('rejects when the page write fails so Hocuspocus keeps the document in memory', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        slugId: 'slug-1',
        content: { type: 'doc', content: [] },
        creatorId: 'user-1',
        contributorIds: [],
      }),
      updatePage: jest
        .fn()
        .mockRejectedValue(new Error('terminating connection due to shutdown')),
    };
    const extension = buildStoreExtension(pageRepo);
    jest.spyOn(extension as any, 'sleep').mockResolvedValue(undefined);
    const { payload, broadcastStateless } = buildStorePayload();

    await expect(extension.onStoreDocument(payload)).rejects.toThrow(
      'terminating connection due to shutdown',
    );
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(
      STORE_RETRY_DELAYS_MS.length + 1,
    );
    expect(broadcastStateless).not.toHaveBeenCalled();
  });

  it('retries a failing write and keeps the page once the database recovers', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        slugId: 'slug-1',
        content: { type: 'doc', content: [] },
        creatorId: 'user-1',
        contributorIds: [],
      }),
      updatePage: jest
        .fn()
        .mockRejectedValueOnce(new Error('terminating connection'))
        .mockRejectedValueOnce(new Error('terminating connection'))
        .mockResolvedValueOnce(undefined),
    };
    const extension = buildStoreExtension(pageRepo);
    jest.spyOn(extension as any, 'sleep').mockResolvedValue(undefined);
    const { payload, broadcastStateless } = buildStorePayload();

    await expect(extension.onStoreDocument(payload)).resolves.toBeUndefined();
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(3);
    expect(broadcastStateless).toHaveBeenCalled();
  });

  it('keeps a persisted page saved when Redis history lookup is unavailable', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        slugId: 'slug-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        content: { type: 'doc', content: [] },
        creatorId: 'user-1',
        contributorIds: [],
        createdAt: new Date('2020-01-01'),
      }),
      updatePage: jest.fn().mockResolvedValue(undefined),
    };
    const collabHistory = {
      addContributors: jest.fn().mockResolvedValue(undefined),
      getRestorePending: jest.fn().mockRejectedValue(new Error('redis down')),
    };
    const extension = buildStoreExtension(pageRepo, { collabHistory });
    const { payload, broadcastStateless } = buildStorePayload();

    await expect(extension.onStoreDocument(payload)).resolves.toBeUndefined();
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(1);
    expect(broadcastStateless).toHaveBeenCalled();
  });

  it('keeps a persisted page saved when Redis contributor tracking is unavailable', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        slugId: 'slug-1',
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        content: { type: 'doc', content: [] },
        creatorId: 'user-1',
        contributorIds: [],
        createdAt: new Date('2020-01-01'),
      }),
      updatePage: jest.fn().mockResolvedValue(undefined),
    };
    const historyQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(undefined),
    };
    const collabHistory = {
      addContributors: jest.fn().mockRejectedValue(new Error('redis down')),
      getRestorePending: jest.fn().mockResolvedValue(undefined),
    };
    const extension = buildStoreExtension(pageRepo, {
      collabHistory,
      historyQueue,
    });

    await expect(
      extension.onStoreDocument(buildStorePayload().payload),
    ).resolves.toBeUndefined();
    expect(pageRepo.updatePage).toHaveBeenCalledTimes(1);
    expect(historyQueue.add).toHaveBeenCalled();
  });

  it('resolves when the page no longer exists so the document can unload', async () => {
    const pageRepo = {
      findById: jest.fn().mockResolvedValue(null),
      updatePage: jest.fn(),
    };
    const extension = buildStoreExtension(pageRepo);

    await expect(
      extension.onStoreDocument(buildStorePayload().payload),
    ).resolves.toBeUndefined();
    expect(pageRepo.updatePage).not.toHaveBeenCalled();
  });
});
