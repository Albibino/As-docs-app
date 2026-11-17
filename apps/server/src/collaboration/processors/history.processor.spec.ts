import { HistoryProcessor } from './history.processor';
import { QueueJob } from '../../integrations/queue/constants';

const restoredContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'alvo' }] }],
};

function buildProcessor(options?: {
  page?: Record<string, unknown>;
  restoreState?: Record<string, unknown>;
  targetRevision?: Record<string, unknown> | undefined;
  lastHistory?: Record<string, unknown> | undefined;
  matchingHistory?: Record<string, unknown> | undefined;
  matchingPostRestoreSnapshot?: Record<string, unknown> | undefined;
}) {
  const page = {
    id: 'page-1',
    title: 'Título restaurado',
    content: restoredContent,
    slugId: 'page-1',
    creatorId: 'user-1',
    spaceId: 'space-1',
    workspaceId: 'workspace-1',
    ...options?.page,
  };
  const pageHistoryRepo = {
    findById: jest.fn().mockResolvedValue(options?.targetRevision),
    findPageLastHistory: jest.fn().mockResolvedValue(options?.lastHistory),
    findLatestMatchingHistory: jest
      .fn()
      .mockResolvedValue(options?.matchingHistory),
    findLatestMatchingSnapshotAfter: jest
      .fn()
      .mockResolvedValue(options?.matchingPostRestoreSnapshot),
    saveHistory: jest.fn().mockResolvedValue(undefined),
  };
  const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
  const collabHistory = {
    getRestorePending: jest.fn().mockResolvedValue(options?.restoreState),
    clearRestorePending: jest.fn().mockResolvedValue(true),
    clearContributors: jest.fn().mockResolvedValue(undefined),
    popContributors: jest.fn().mockResolvedValue(['user-1']),
    addContributors: jest.fn().mockResolvedValue(undefined),
  };
  const watcherService = {
    addPageWatchers: jest.fn().mockResolvedValue(undefined),
  };
  const notificationQueue = { add: jest.fn().mockResolvedValue(undefined) };
  const generalQueue = { add: jest.fn().mockResolvedValue(undefined) };

  return {
    processor: new HistoryProcessor(
      pageHistoryRepo as any,
      pageRepo as any,
      collabHistory as any,
      watcherService as any,
      notificationQueue as any,
      generalQueue as any,
    ),
    page,
    pageHistoryRepo,
    pageRepo,
    collabHistory,
    watcherService,
    notificationQueue,
    generalQueue,
  };
}

function jobFor(pageId = 'page-1', data: Record<string, unknown> = {}) {
  return {
    name: QueueJob.PAGE_HISTORY,
    data: { pageId, ...data },
  } as any;
}

describe('HistoryProcessor restore snapshots', () => {
  const restoreState = {
    token: 'restore-token',
    targetRevisionId: 'revision-target',
    snapshotId: 'snapshot-before-restore',
    markedAt: 1_700_000_000_000,
  };

  it('does not create a snapshot for the write that applies the restored revision', async () => {
    const { processor, pageHistoryRepo, collabHistory } = buildProcessor({
      restoreState,
      targetRevision: {
        id: 'revision-target',
        title: 'Título restaurado',
        content: restoredContent,
      },
    });

    await processor.process(
      jobFor('page-1', {
        restoreToken: 'restore-token',
        enqueuedAt: restoreState.markedAt,
      }),
    );

    expect(pageHistoryRepo.saveHistory).not.toHaveBeenCalled();
    expect(collabHistory.clearRestorePending).not.toHaveBeenCalled();
    expect(collabHistory.clearContributors).toHaveBeenCalledWith('page-1');
  });

  it('creates the first changed snapshot and clears its matching restore marker', async () => {
    const { processor, pageHistoryRepo, collabHistory, notificationQueue } =
      buildProcessor({
        restoreState,
        page: { title: 'Nova edição' },
        targetRevision: {
          id: 'revision-target',
          title: 'Título restaurado',
          content: restoredContent,
        },
      });

    await processor.process(
      jobFor('page-1', {
        restoreToken: 'restore-token',
        enqueuedAt: restoreState.markedAt + 1,
      }),
    );

    expect(pageHistoryRepo.saveHistory).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Nova edição' }),
      expect.objectContaining({ contributorIds: expect.any(Array) }),
    );
    expect(collabHistory.clearRestorePending).toHaveBeenCalledWith(
      'page-1',
      'restore-token',
    );
    expect(notificationQueue.add).toHaveBeenCalled();
  });

  it('ignores a job enqueued before the restore marker without consuming contributors', async () => {
    const { processor, pageRepo, collabHistory } = buildProcessor({
      restoreState,
      targetRevision: { title: 'Título restaurado', content: restoredContent },
    });

    await processor.process(
      jobFor('page-1', {
        restoreToken: 'restore-token',
        enqueuedAt: restoreState.markedAt - 1,
      }),
    );

    expect(pageRepo.findById).not.toHaveBeenCalled();
    expect(collabHistory.popContributors).not.toHaveBeenCalled();
  });

  it('does not duplicate a matching manual restore target when Redis has no marker', async () => {
    const { processor, pageHistoryRepo, collabHistory } = buildProcessor({
      lastHistory: { title: 'Anterior', content: { type: 'doc', content: [] } },
      matchingHistory: { id: 'manual-target', kind: 'manual' },
    });

    await processor.process(jobFor());

    expect(pageHistoryRepo.saveHistory).not.toHaveBeenCalled();
    expect(collabHistory.clearContributors).toHaveBeenCalledWith('page-1');
  });

  it('falls back to database matching when Redis is unavailable', async () => {
    const { processor, pageHistoryRepo, collabHistory } = buildProcessor({
      lastHistory: { title: 'Anterior', content: { type: 'doc', content: [] } },
      matchingHistory: { id: 'manual-target', kind: 'manual' },
    });
    collabHistory.getRestorePending.mockRejectedValue(
      new Error('redis unavailable'),
    );

    await expect(processor.process(jobFor())).resolves.toBeUndefined();

    expect(pageHistoryRepo.findLatestMatchingHistory).toHaveBeenCalledWith(
      'page-1',
      'Título restaurado',
      restoredContent,
    );
    expect(pageHistoryRepo.saveHistory).not.toHaveBeenCalled();
    expect(collabHistory.clearContributors).toHaveBeenCalledWith('page-1');
  });

  it('creates a post-restore snapshot even when it matches an older automatic revision', async () => {
    const { processor, pageHistoryRepo } = buildProcessor({
      restoreState,
      page: { title: 'Edição revertida' },
      targetRevision: { title: 'Título restaurado', content: restoredContent },
    });

    await processor.process(
      jobFor('page-1', {
        restoreToken: 'restore-token',
        enqueuedAt: restoreState.markedAt + 1,
      }),
    );

    expect(
      pageHistoryRepo.findLatestMatchingSnapshotAfter,
    ).toHaveBeenCalledWith(
      'page-1',
      'Edição revertida',
      restoredContent,
      new Date(restoreState.markedAt),
    );
    expect(pageHistoryRepo.saveHistory).toHaveBeenCalled();
  });

  it('keeps the marker and contributors when the insert fails so BullMQ can retry', async () => {
    const { processor, pageHistoryRepo, collabHistory } = buildProcessor({
      restoreState,
      page: { title: 'Nova edição' },
      targetRevision: { title: 'Título restaurado', content: restoredContent },
    });
    pageHistoryRepo.saveHistory.mockRejectedValue(new Error('database down'));

    await expect(
      processor.process(
        jobFor('page-1', {
          restoreToken: 'restore-token',
          enqueuedAt: restoreState.markedAt + 1,
        }),
      ),
    ).rejects.toThrow('database down');

    expect(collabHistory.clearRestorePending).not.toHaveBeenCalled();
    expect(collabHistory.addContributors).toHaveBeenCalledWith('page-1', [
      'user-1',
    ]);
  });

  it('keeps side effects after an inserted snapshot when marker cleanup is unavailable', async () => {
    const { processor, collabHistory, generalQueue } = buildProcessor({
      restoreState,
      page: { title: 'Nova edição' },
      targetRevision: { title: 'Título restaurado', content: restoredContent },
    });
    collabHistory.clearRestorePending.mockRejectedValue(
      new Error('redis down'),
    );

    await expect(
      processor.process(
        jobFor('page-1', {
          restoreToken: 'restore-token',
          enqueuedAt: restoreState.markedAt + 1,
        }),
      ),
    ).resolves.toBeUndefined();

    expect(collabHistory.addContributors).not.toHaveBeenCalled();
    expect(generalQueue.add).toHaveBeenCalled();
  });
});
