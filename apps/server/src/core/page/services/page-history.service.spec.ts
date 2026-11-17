import { PageHistoryService } from './page-history.service';
import { PageHistoryRepo } from '@tcc-docs/db/repos/page/page-history.repo';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('PageHistoryService history listing', () => {
  it('returns the current revision id with the history page', async () => {
    const history = {
      items: [{ id: 'rev-current', pageId: 'page-1', createdAt: new Date() }],
      meta: { nextCursor: null },
    };
    const pageHistoryRepo = {
      findPageHistoryByPageId: jest.fn().mockResolvedValue(history),
      findPageLastHistory: jest.fn().mockResolvedValue(history.items[0]),
    };

    const service = new PageHistoryService(pageHistoryRepo as any);

    const result = await service.findHistoryByPageIdWithCurrent('page-1', {
      limit: 20,
    } as any);
    expect(result).toMatchObject({ ...history, currentRevisionId: 'rev-current' });
    expect(result).not.toHaveProperty('publishedRevisionId');
  });
});

describe('PageHistoryService manual versions', () => {
  it('stores the editor payload as an immutable manual checkpoint with its description', async () => {
    const pageHistoryRepo = {
      insertPageHistory: jest.fn().mockResolvedValue({ id: 'history-1' }),
    };
    const service = new PageHistoryService(pageHistoryRepo as any);
    const page = {
      id: 'page-1',
      slugId: 'page-slug',
      icon: '📄',
      coverPhoto: 'https://example.com/cover.png',
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
    } as any;

    await service.saveManualVersion(
      page,
      {
        title: 'Título salvo',
        content: { type: 'doc', content: [] },
        description: 'Marco inicial',
      },
      { id: 'editor-1' } as any,
    );

    expect(pageHistoryRepo.insertPageHistory).toHaveBeenCalledWith({
      pageId: 'page-1',
      slugId: 'page-slug',
      title: 'Título salvo',
      content: { type: 'doc', content: [] },
      icon: '📄',
      coverPhoto: 'https://example.com/cover.png',
      lastUpdatedById: 'editor-1',
      contributorIds: ['editor-1'],
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
      kind: 'manual',
      description: 'Marco inicial',
    });
  });
});

describe('PageHistoryService restore snapshots', () => {
  const page = {
    id: 'page-1',
    slugId: 'page-slug',
    title: 'Título persistido',
    content: { type: 'doc', content: [] },
    icon: '📄',
    coverPhoto: 'https://example.com/cover.png',
    creatorId: 'creator-1',
    spaceId: 'space-1',
    workspaceId: 'workspace-1',
    deletedAt: null,
  } as any;
  const dto = {
    pageId: 'page-1',
    historyId: 'revision-target',
    title: 'Parte concluída',
    content: { type: 'doc', content: [{ type: 'paragraph' }] },
  };
  const user = { id: 'user-1' } as any;

  function setup(overrides?: {
    lockedPage?: any;
    targetRevision?: any;
    matchingSnapshot?: any;
  }) {
    const trx = { transaction: true };
    const db = {
      transaction: () => ({
        execute: (callback: (trx: unknown) => Promise<unknown>) =>
          callback(trx),
      }),
    };
    const snapshot = {
      id: 'snapshot-1',
      pageId: page.id,
      title: dto.title,
      content: dto.content,
    };
    const pageHistoryRepo = {
      findById: jest.fn().mockResolvedValue(
        overrides?.targetRevision ?? {
          id: dto.historyId,
          pageId: page.id,
          content: { type: 'doc', content: [] },
        },
      ),
      findLatestMatchingSnapshot: jest
        .fn()
        .mockResolvedValue(overrides?.matchingSnapshot),
      insertPageHistory: jest.fn().mockResolvedValue(snapshot),
    };
    const pageRepo = {
      findById: jest.fn().mockResolvedValue(overrides?.lockedPage ?? page),
    };
    const collabHistory = {
      getRestoreRequest: jest.fn().mockResolvedValue(undefined),
      reserveRestoreRequest: jest.fn().mockResolvedValue(true),
      completeRestoreRequest: jest.fn().mockResolvedValue(true),
      clearRestoreRequest: jest.fn().mockResolvedValue(true),
      markRestorePending: jest.fn().mockResolvedValue(undefined),
    };
    const service = new PageHistoryService(
      pageHistoryRepo as any,
      pageRepo as any,
      db as any,
      collabHistory as any,
    );

    return {
      service,
      trx,
      snapshot,
      pageHistoryRepo,
      pageRepo,
      collabHistory,
    };
  }

  it('inserts an automatic immutable snapshot with the live editor payload', async () => {
    const { service, trx, pageHistoryRepo, pageRepo, collabHistory } = setup();

    await expect(
      service.snapshotBeforeRestore(page, dto, user),
    ).resolves.toMatchObject({
      snapshot: expect.objectContaining({ id: 'snapshot-1' }),
      targetRevisionId: 'revision-target',
      restoreToken: expect.any(String),
    });

    expect(pageRepo.findById).toHaveBeenCalledWith('page-1', {
      withLock: true,
      includeContent: true,
      trx,
    });
    expect(pageHistoryRepo.findById).toHaveBeenCalledWith('revision-target', {
      includeContent: true,
      trx,
    });
    expect(pageHistoryRepo.insertPageHistory).toHaveBeenCalledWith(
      {
        pageId: 'page-1',
        slugId: 'page-slug',
        title: 'Parte concluída',
        content: { type: 'doc', content: [{ type: 'paragraph' }] },
        icon: '📄',
        coverPhoto: 'https://example.com/cover.png',
        lastUpdatedById: 'user-1',
        contributorIds: ['user-1'],
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
        kind: 'automatic',
        description: undefined,
      },
      trx,
    );
    expect(collabHistory.markRestorePending).toHaveBeenCalledWith(
      'page-1',
      expect.objectContaining({
        token: expect.any(String),
        targetRevisionId: 'revision-target',
        snapshotId: 'snapshot-1',
        markedAt: expect.any(Number),
      }),
    );
  });

  it('rejects a target revision that belongs to another page', async () => {
    const { service, pageHistoryRepo } = setup({
      targetRevision: { id: 'revision-target', pageId: 'page-other' },
    });

    await expect(
      service.snapshotBeforeRestore(page, dto, user),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pageHistoryRepo.insertPageHistory).not.toHaveBeenCalled();
  });

  it.each([
    ['deleted', { ...page, deletedAt: new Date() }],
    ['from another workspace', { ...page, workspaceId: 'workspace-other' }],
  ])('rejects when the locked page is %s', async (_reason, lockedPage) => {
    const { service, pageHistoryRepo } = setup({ lockedPage });

    await expect(
      service.snapshotBeforeRestore(page, dto, user),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(pageHistoryRepo.findById).not.toHaveBeenCalled();
  });

  it('reuses an equivalent automatic snapshot when requestId is absent', async () => {
    const matchingSnapshot = {
      id: 'snapshot-existing',
      pageId: page.id,
      title: dto.title,
      content: dto.content,
    };
    const { service, pageHistoryRepo } = setup({ matchingSnapshot });

    await expect(
      service.snapshotBeforeRestore(page, dto, user),
    ).resolves.toMatchObject({ snapshot: matchingSnapshot });
    expect(pageHistoryRepo.insertPageHistory).not.toHaveBeenCalled();
  });

  it('does not duplicate a revision when the same requestId is repeated', async () => {
    const { service, pageHistoryRepo, pageRepo, collabHistory } = setup();
    collabHistory.getRestoreRequest.mockResolvedValue({
      snapshotId: 'snapshot-1',
      targetRevisionId: 'revision-target',
      restoreToken: 'restore-token',
    });
    pageHistoryRepo.findById.mockResolvedValue({
      id: 'snapshot-1',
      pageId: 'page-1',
      content: dto.content,
    });

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({
      snapshot: expect.objectContaining({ id: 'snapshot-1' }),
      targetRevisionId: 'revision-target',
      restoreToken: 'restore-token',
    });
    expect(pageHistoryRepo.findById).toHaveBeenCalledWith('snapshot-1', {
      includeContent: true,
    });
    expect(pageRepo.findById).not.toHaveBeenCalled();
    expect(pageHistoryRepo.insertPageHistory).not.toHaveBeenCalled();
  });

  it('waits for the complete result when the same request is already processing', async () => {
    const { service, pageHistoryRepo, pageRepo, collabHistory } = setup();
    collabHistory.getRestoreRequest
      .mockResolvedValueOnce({ status: 'processing' })
      .mockResolvedValueOnce({
        status: 'done',
        snapshotId: 'snapshot-1',
        targetRevisionId: 'revision-target',
        restoreToken: 'restore-token',
      });
    pageHistoryRepo.findById.mockResolvedValue({
      id: 'snapshot-1',
      pageId: 'page-1',
      content: dto.content,
    });

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({
      snapshot: { id: 'snapshot-1' },
      restoreToken: 'restore-token',
    });
    expect(collabHistory.reserveRestoreRequest).not.toHaveBeenCalled();
    expect(pageRepo.findById).not.toHaveBeenCalled();
  });

  it('stores the completed request result after the snapshot transaction commits', async () => {
    const { service, collabHistory } = setup();

    const result = await service.snapshotBeforeRestore(
      page,
      { ...dto, requestId: 'request-1' },
      user,
    );

    expect(collabHistory.reserveRestoreRequest).toHaveBeenCalledWith(
      'page-1',
      'request-1',
      expect.any(String),
    );
    expect(collabHistory.completeRestoreRequest).toHaveBeenCalledWith(
      'page-1',
      'request-1',
      expect.any(String),
      {
        status: 'done',
        snapshotId: 'snapshot-1',
        targetRevisionId: 'revision-target',
        restoreToken: result.restoreToken,
      },
    );
  });

  it('clears an idempotency reservation when the SQL transaction fails', async () => {
    const { service, collabHistory } = setup({
      targetRevision: { id: 'revision-target', pageId: 'page-other' },
    });

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(collabHistory.clearRestoreRequest).toHaveBeenCalledWith(
      'page-1',
      'request-1',
      expect.any(String),
    );
  });

  it('retries a transient failure when completing the idempotent result', async () => {
    const { service, collabHistory } = setup();
    collabHistory.completeRestoreRequest
      .mockRejectedValueOnce(new Error('redis unavailable'))
      .mockResolvedValueOnce(true);
    jest.spyOn((service as any).logger, 'error').mockImplementation();

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({ snapshot: { id: 'snapshot-1' } });
    expect(collabHistory.completeRestoreRequest).toHaveBeenCalledTimes(2);
    expect(collabHistory.clearRestoreRequest).not.toHaveBeenCalled();
  });

  it('does not clear a reservation after another owner replaces it', async () => {
    const { service, collabHistory } = setup();
    collabHistory.completeRestoreRequest.mockResolvedValue(false);
    jest.spyOn((service as any).logger, 'warn').mockImplementation();

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({ snapshot: { id: 'snapshot-1' } });
    expect(collabHistory.completeRestoreRequest).toHaveBeenCalledTimes(1);
    expect(collabHistory.clearRestoreRequest).not.toHaveBeenCalled();
  });

  it('safely releases its reservation when completion keeps failing', async () => {
    const { service, snapshot, pageHistoryRepo, collabHistory } = setup();
    collabHistory.completeRestoreRequest.mockRejectedValue(
      new Error('redis unavailable'),
    );
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

    await service.snapshotBeforeRestore(
      page,
      { ...dto, requestId: 'request-1' },
      user,
    );

    const reservationToken =
      collabHistory.reserveRestoreRequest.mock.calls[0][2];
    expect(collabHistory.completeRestoreRequest).toHaveBeenCalledTimes(3);
    expect(collabHistory.clearRestoreRequest).toHaveBeenCalledWith(
      'page-1',
      'request-1',
      reservationToken,
    );

    collabHistory.completeRestoreRequest.mockReset().mockResolvedValue(true);
    collabHistory.getRestoreRequest.mockResolvedValue(undefined);
    collabHistory.reserveRestoreRequest.mockResolvedValue(true);
    pageHistoryRepo.findLatestMatchingSnapshot.mockResolvedValue(snapshot);

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({ snapshot: { id: 'snapshot-1' } });
    expect(pageHistoryRepo.insertPageHistory).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('reclaims a processing request after its lease expires', async () => {
    const { service, collabHistory } = setup();
    collabHistory.getRestoreRequest
      .mockResolvedValueOnce({
        status: 'processing',
        reservationToken: 'abandoned-reservation',
      })
      .mockResolvedValueOnce(undefined);
    collabHistory.reserveRestoreRequest.mockResolvedValue(true);

    await expect(
      service.snapshotBeforeRestore(
        page,
        { ...dto, requestId: 'request-1' },
        user,
      ),
    ).resolves.toMatchObject({ snapshot: { id: 'snapshot-1' } });
    expect(collabHistory.reserveRestoreRequest).toHaveBeenCalledWith(
      'page-1',
      'request-1',
      expect.any(String),
    );
  });

  it('keeps the committed snapshot when Redis cannot mark the restore', async () => {
    const { service, snapshot, collabHistory } = setup();
    collabHistory.markRestorePending.mockRejectedValue(
      new Error('redis unavailable'),
    );
    const errorSpy = jest
      .spyOn((service as any).logger, 'error')
      .mockImplementation();

    await expect(
      service.snapshotBeforeRestore(page, dto, user),
    ).resolves.toEqual({
      snapshot,
      targetRevisionId: 'revision-target',
    });
    expect(errorSpy).toHaveBeenCalled();
  });
});

describe('PageHistoryRepo automatic snapshots', () => {
  it('marks snapshots created from pages as automatic', async () => {
    const repo = new PageHistoryRepo({} as any);
    const insertPageHistory = jest
      .spyOn(repo, 'insertPageHistory')
      .mockResolvedValue({} as any);

    await repo.saveHistory({
      id: 'page-1',
      slugId: 'page-slug',
      title: 'Título atual',
      content: { type: 'doc', content: [] },
      icon: null,
      coverPhoto: null,
      lastUpdatedById: 'editor-1',
      creatorId: 'creator-1',
      spaceId: 'space-1',
      workspaceId: 'workspace-1',
    } as any);

    expect(insertPageHistory).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'automatic' }),
      undefined,
    );
  });
});
