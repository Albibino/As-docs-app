import { PageController } from './page.controller';
import { PageService } from './services/page.service';

describe('PageController home endpoints', () => {
  let controller: PageController;
  let pageService: jest.Mocked<PageService>;

  beforeEach(() => {
    pageService = {
      getPagesByIds: jest.fn(),
      getPagesEditedByUser: jest.fn(),
    } as any;
    controller = Object.create(PageController.prototype);
    (controller as any).pageService = pageService;
  });

  it('hydrates a bounded ordered batch in the authenticated workspace', async () => {
    pageService.getPagesByIds.mockResolvedValue([{ id: 'page-1' }] as any);

    await expect(
      controller.getPagesByIds(
        { pageIds: ['page-1'] },
        { id: 'user-1' } as any,
        { id: 'workspace-1' } as any,
      ),
    ).resolves.toEqual([{ id: 'page-1' }]);

    expect(pageService.getPagesByIds).toHaveBeenCalledWith(
      ['page-1'],
      'user-1',
      'workspace-1',
    );
  });

  it('uses the authenticated user for edited-by-me', async () => {
    const response = { items: [], meta: { limit: 10 } } as any;
    pageService.getPagesEditedByUser.mockResolvedValue(response);
    const pagination = { limit: 10, cursor: 'next' } as any;

    await expect(
      controller.getPagesEditedByMe(
        pagination,
        { id: 'user-1' } as any,
        { id: 'workspace-1' } as any,
      ),
    ).resolves.toBe(response);

    expect(pageService.getPagesEditedByUser).toHaveBeenCalledWith(
      'user-1',
      'workspace-1',
      pagination,
    );
  });
});
