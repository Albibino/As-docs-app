import { PageService } from '../page/services/page.service';

describe('PageService page-property move integration', () => {
  it('deletes source-space property values for every moved page', async () => {
    const rootPage = {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      spaceId: 'source-space',
      workspaceId: 'workspace-1',
    } as any;
    const childPage = {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      parentPageId: rootPage.id,
      spaceId: 'source-space',
      workspaceId: 'workspace-1',
    } as any;
    const executeDelete = jest.fn().mockResolvedValue(undefined);
    const deleteQuery: any = { execute: executeDelete };
    const deleteWhere = jest.fn().mockReturnValue(deleteQuery);
    deleteQuery.where = deleteWhere;
    const selectQuery: any = {};
    selectQuery.select = jest.fn().mockReturnValue(selectQuery);
    selectQuery.where = jest.fn().mockReturnValue(selectQuery);
    const trx = {
      deleteFrom: jest.fn().mockReturnValue(deleteQuery),
      selectFrom: jest.fn().mockReturnValue(selectQuery),
      updateTable: jest.fn().mockReturnValue({
        set: jest.fn().mockReturnValue({
          where: jest.fn().mockReturnValue({ execute: jest.fn() }),
        }),
      }),
    } as any;
    const db = {
      transaction: jest.fn().mockReturnValue({
        execute: (callback: (transaction: unknown) => unknown) => callback(trx),
      }),
    } as any;
    const pageRepo = {
      getPageAndDescendants: jest.fn().mockResolvedValue([rootPage, childPage]),
      updatePage: jest.fn(),
      updatePages: jest.fn(),
    } as any;
    const attachmentRepo = {
      updateAttachmentsByPageId: jest.fn(),
    } as any;
    const aiQueue = { add: jest.fn() } as any;
    const watcherService = {
      movePageWatchersToSpace: jest.fn(),
    } as any;
    const service = new PageService(
      pageRepo,
      {} as any,
      attachmentRepo,
      db,
      {} as any,
      {} as any,
      aiQueue,
      {} as any,
      { emit: jest.fn() } as any,
      {} as any,
      watcherService,
      {} as any,
      {
        logAssignmentsRemovedForPageMove: jest.fn(),
        logTreeOnlyAssignmentsRemovedForPageMove: jest.fn(),
      } as any,
    );
    jest
      .spyOn(service as any, 'filterAccessibleTreePages')
      .mockResolvedValue([rootPage, childPage]);
    jest.spyOn(service, 'nextPagePosition').mockResolvedValue('0');

    await service.movePageToSpace(rootPage, 'destination-space', 'user-1');

    expect(trx.deleteFrom).toHaveBeenCalledWith('pagePropertyValues');
    expect(deleteWhere).toHaveBeenCalledWith('pageId', 'in', [
      rootPage.id,
      childPage.id,
    ]);
    expect(executeDelete).toHaveBeenCalled();
  });
});
