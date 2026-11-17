import { Test, TestingModule } from '@nestjs/testing';
import { PageService } from './page.service';
import { QueueJob } from '../../../integrations/queue/constants';

function createPageService({
  pageRepo,
  pagePermissionRepo,
  historyQueue = { add: jest.fn().mockResolvedValue(undefined) },
  collabHistory = { getRestorePending: jest.fn().mockResolvedValue(undefined) },
}: {
  pageRepo: Record<string, jest.Mock>;
  pagePermissionRepo: Record<string, jest.Mock>;
  historyQueue?: Record<string, jest.Mock>;
  collabHistory?: Record<string, jest.Mock>;
}) {
  const service = new PageService(
    pageRepo as never,
    pagePermissionRepo as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    historyQueue as never,
    collabHistory as never,
  );
  return service;
}

describe('PageService', () => {
  let service: PageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PageService],
    })
      .useMocker(() => ({}))
      .compile();

    service = module.get<PageService>(PageService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('lists only the member own deleted pages in the Space trash', async () => {
    const pageRepo = {
      getDeletedPagesInSpace: jest.fn().mockResolvedValue({
        items: [
          { id: 'own-page', creatorId: 'user-1' },
          { id: 'other-page', creatorId: 'user-2' },
        ],
        nextCursor: null,
        prevCursor: null,
      }),
    };
    const pagePermissionRepo = {
      filterAccessiblePageIds: jest.fn().mockResolvedValue(['own-page']),
    };
    const scopedService = createPageService({ pageRepo, pagePermissionRepo });

    const result = await scopedService.getDeletedSpacePages(
      'space-1',
      'user-1',
      {} as never,
      false,
    );

    expect(pageRepo.getDeletedPagesInSpace).toHaveBeenCalledWith(
      'space-1',
      expect.anything(),
      'user-1',
    );
    expect(pagePermissionRepo.filterAccessiblePageIds).not.toHaveBeenCalled();
    expect(result.items).toEqual([{ id: 'own-page', creatorId: 'user-1' }]);
  });

  it('schedules a title-only edit in the post-restore history debounce', async () => {
    const pageRepo = {
      updatePage: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        title: 'Novo título',
        slugId: 'slug-1',
        contributorIds: ['user-1'],
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
      }),
    };
    const delayedJob = {
      getState: jest.fn().mockResolvedValue('delayed'),
      remove: jest.fn().mockResolvedValue(undefined),
    };
    const historyQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest
        .fn()
        .mockResolvedValueOnce(delayedJob)
        .mockResolvedValueOnce(undefined),
    };
    const collabHistory = {
      getRestorePending: jest.fn().mockResolvedValue({
        token: 'restore-token',
        targetRevisionId: 'revision-target',
        snapshotId: 'snapshot-before-restore',
        markedAt: Date.now(),
      }),
      addContributors: jest.fn().mockResolvedValue(undefined),
    };
    const scopedService = createPageService({
      pageRepo,
      pagePermissionRepo: {},
      historyQueue,
      collabHistory,
    });
    (scopedService as any).generalQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    await scopedService.update(
      {
        id: 'page-1',
        title: 'Título anterior',
        contributorIds: ['user-1'],
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
      } as any,
      { title: 'Novo título' } as any,
      { id: 'user-1' } as any,
    );

    expect(historyQueue.add).toHaveBeenCalledWith(
      QueueJob.PAGE_HISTORY,
      expect.objectContaining({
        pageId: 'page-1',
        restoreToken: 'restore-token',
        forceFast: true,
      }),
      expect.objectContaining({ delay: 60_000 }),
    );
    expect(historyQueue.getJob).toHaveBeenCalledWith('page-history:page-1');
    expect(historyQueue.getJob).toHaveBeenCalledWith('page-1');
    expect(delayedJob.remove).toHaveBeenCalled();
  });

  it('does not fail a title update when restore-state Redis is unavailable', async () => {
    const pageRepo = {
      updatePage: jest.fn().mockResolvedValue(undefined),
      findById: jest.fn().mockResolvedValue({
        id: 'page-1',
        title: 'Novo título',
        contributorIds: ['user-1'],
        spaceId: 'space-1',
        workspaceId: 'workspace-1',
      }),
    };
    const collabHistory = {
      getRestorePending: jest
        .fn()
        .mockRejectedValue(new Error('redis unavailable')),
    };
    const scopedService = createPageService({
      pageRepo,
      pagePermissionRepo: {},
      collabHistory,
    });
    (scopedService as any).generalQueue = {
      add: jest.fn().mockResolvedValue(undefined),
    };

    await expect(
      scopedService.update(
        {
          id: 'page-1',
          title: 'Título anterior',
          contributorIds: ['user-1'],
          spaceId: 'space-1',
          workspaceId: 'workspace-1',
        } as any,
        { title: 'Novo título' } as any,
        { id: 'user-1' } as any,
      ),
    ).resolves.toBeDefined();
  });
});
