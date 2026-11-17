import { WsService } from './ws.service';
import { getSpaceRoomName } from './ws.utils';

const workspaceId = 'workspace-id';
const spaceId = 'space-id';
const pageId = 'page-id';

function socket(userId: string, socketId = `${userId}-socket`) {
  return {
    id: socketId,
    data: { userId, workspaceId },
    rooms: new Set([getSpaceRoomName(spaceId)]),
    leave: jest.fn(),
    emit: jest.fn(),
  } as any;
}

function setup(users: Record<string, string | null>) {
  const sockets: any[] = [];
  const pagePermissionRepo = {
    hasRestrictedPagesInSpace: jest.fn().mockResolvedValue(true),
    hasRestrictedAncestor: jest.fn().mockResolvedValue(true),
    getUserIdsWithPageAccess: jest
      .fn()
      .mockImplementation(async (_page: string, userIds: string[]) =>
        userIds.filter((userId) => users[userId] === 'explicit'),
      ),
  };
  const userRepo = {
    findById: jest.fn().mockImplementation(async (userId: string) => {
      if (!(userId in users)) return undefined;
      return {
        id: userId,
        workspaceId,
        role: 'member',
        deletedAt: null,
        deactivatedAt: null,
      };
    }),
  };
  const spaceAuthorization = {
    resolve: jest.fn().mockImplementation(async (user: { id: string }) => {
      const source = users[user.id];
      if (!source) return null;
      return {
        userId: user.id,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        source,
      };
    }),
  };
  const cacheManager = {
    get: jest.fn().mockResolvedValue(undefined),
    set: jest.fn(),
    del: jest.fn(),
  };
  const service = new WsService(
    pagePermissionRepo as never,
    userRepo as never,
    spaceAuthorization as never,
    cacheManager as never,
  );
  service.setServer({
    in: jest.fn().mockReturnValue({
      fetchSockets: jest.fn().mockResolvedValue(sockets),
    }),
  } as any);

  return { service, sockets, pagePermissionRepo };
}

describe('WsService', () => {
  it('removes a socket that lost Space access before accepting tree events', async () => {
    const { service } = setup({ sender: null });
    const sender = socket('sender');

    await service.handleTreeEvent(sender, {
      operation: 'updateOne',
      spaceId,
      id: pageId,
    });

    expect(sender.leave).toHaveBeenCalledWith(getSpaceRoomName(spaceId));
    expect(sender.emit).not.toHaveBeenCalled();
  });

  it('filters restricted tree events by current Space and page access', async () => {
    const { service, sockets, pagePermissionRepo } = setup({
      sender: 'team-admin',
      allowed: 'explicit',
      revoked: null,
    });
    const sender = socket('sender');
    const allowed = socket('allowed');
    const revoked = socket('revoked');
    sockets.push(sender, allowed, revoked);

    await service.handleTreeEvent(sender, {
      operation: 'updateOne',
      spaceId,
      id: pageId,
    });

    expect(allowed.emit).toHaveBeenCalledWith('message', expect.any(Object));
    expect(revoked.emit).not.toHaveBeenCalled();
    expect(pagePermissionRepo.getUserIdsWithPageAccess).toHaveBeenCalledWith(
      pageId,
      ['allowed'],
    );
  });
});
