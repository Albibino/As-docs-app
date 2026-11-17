import { PageService } from './page.service';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';

const page = (id: string) => ({
  id,
  title: id,
  deletedAt: null,
  updatedAt: new Date(),
}) as any;

const paginationResult = (items: any[]) => ({
  items,
  meta: {
    limit: 20,
    hasNextPage: false,
    hasPrevPage: false,
    nextCursor: null,
    prevCursor: null,
  },
});

describe('PageService home queries', () => {
  let service: PageService;
  let pageRepo: jest.Mocked<PageRepo>;
  let permissionRepo: jest.Mocked<PagePermissionRepo>;

  beforeEach(() => {
    pageRepo = {
      findManyByIds: jest.fn(),
      getPagesEditedByUser: jest.fn(),
      getRecentPagesInSpace: jest.fn(),
    } as any;
    permissionRepo = {
      filterAccessiblePageIds: jest.fn(),
    } as any;

    service = Object.create(PageService.prototype);
    (service as any).pageRepo = pageRepo;
    (service as any).pagePermissionRepo = permissionRepo;
  });

  describe('getPagesByIds', () => {
    it('limits candidates by workspace/membership, filters page permissions and preserves request order', async () => {
      pageRepo.findManyByIds.mockResolvedValue([
        page('page-b'),
        page('page-c'),
        page('page-a'),
      ]);
      permissionRepo.filterAccessiblePageIds.mockResolvedValue([
        'page-a',
        'page-b',
      ]);

      const result = await service.getPagesByIds(
        ['page-b', 'page-c', 'page-a', 'page-b'],
        'user-1',
        'workspace-1',
      );

      expect(pageRepo.findManyByIds).toHaveBeenCalledWith(
        ['page-b', 'page-c', 'page-a'],
        { workspaceId: 'workspace-1', userId: 'user-1' },
      );
      expect(permissionRepo.filterAccessiblePageIds).toHaveBeenCalledWith({
        pageIds: ['page-b', 'page-c', 'page-a'],
        userId: 'user-1',
      });
      expect(result.map((item) => item.id)).toEqual(['page-b', 'page-a']);
    });

    it('does not run a permission query for an empty batch', async () => {
      await expect(
        service.getPagesByIds([], 'user-1', 'workspace-1'),
      ).resolves.toEqual([]);
      expect(pageRepo.findManyByIds).not.toHaveBeenCalled();
      expect(permissionRepo.filterAccessiblePageIds).not.toHaveBeenCalled();
    });
  });

  describe('getPagesEditedByUser', () => {
    it('delegates cursor pagination and removes inaccessible pages', async () => {
      pageRepo.getPagesEditedByUser.mockResolvedValue(
        paginationResult([page('page-a'), page('page-b')]) as any,
      );
      permissionRepo.filterAccessiblePageIds.mockResolvedValue(['page-b']);
      const pagination = { limit: 10, cursor: 'cursor-1' } as any;

      const result = await service.getPagesEditedByUser(
        'user-1',
        'workspace-1',
        pagination,
      );

      expect(pageRepo.getPagesEditedByUser).toHaveBeenCalledWith(
        'user-1',
        'workspace-1',
        pagination,
      );
      expect(result.items.map((item) => item.id)).toEqual(['page-b']);
    });
  });

  describe('getRecentSpacePages', () => {
    it('filters restricted pages using the space-aware permission fast path', async () => {
      pageRepo.getRecentPagesInSpace.mockResolvedValue(
        paginationResult([page('page-a'), page('page-b')]) as any,
      );
      permissionRepo.filterAccessiblePageIds.mockResolvedValue(['page-a']);

      const result = await service.getRecentSpacePages(
        'space-1',
        'user-1',
        { limit: 20 } as any,
      );

      expect(permissionRepo.filterAccessiblePageIds).toHaveBeenCalledWith({
        pageIds: ['page-a', 'page-b'],
        userId: 'user-1',
        spaceId: 'space-1',
      });
      expect(result.items.map((item) => item.id)).toEqual(['page-a']);
    });

    it('keeps the complete result when every page is accessible', async () => {
      pageRepo.getRecentPagesInSpace.mockResolvedValue(
        paginationResult([page('page-a'), page('page-b')]) as any,
      );
      permissionRepo.filterAccessiblePageIds.mockResolvedValue([
        'page-a',
        'page-b',
      ]);

      const result = await service.getRecentSpacePages(
        'space-1',
        'user-1',
        { limit: 20 } as any,
      );

      expect(result.items).toHaveLength(2);
    });
  });
});
