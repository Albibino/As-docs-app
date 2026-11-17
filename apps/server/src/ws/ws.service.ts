import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { Server, Socket } from 'socket.io';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { User } from '@tcc-docs/db/types/entity.types';
import { SpaceAuthorizationService } from '../core/space/services/space-authorization.service';
import {
  TREE_EVENTS,
  WS_SPACE_RESTRICTION_CACHE_PREFIX,
  WS_CACHE_TTL_MS,
  getSpaceRoomName,
  getUserRoomName,
} from './ws.utils';

@Injectable()
export class WsService {
  private server: Server;

  constructor(
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly userRepo: UserRepo,
    private readonly spaceAuthorization: SpaceAuthorizationService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  setServer(server: Server): void {
    this.server = server;
  }

  async handleTreeEvent(client: Socket, data: any): Promise<void> {
    const room = getSpaceRoomName(data.spaceId);

    if (!(await this.getAuthorizedUser(client, data.spaceId))) {
      client.leave(room);
      return;
    }

    if (!client.rooms.has(room)) {
      return;
    }

    const pageId =
      data.operation === 'refetchRootTreeNodeEvent'
        ? null
        : this.extractPageId(data);

    if (
      pageId &&
      (await this.spaceHasRestrictions(data.spaceId)) &&
      (await this.pagePermissionRepo.hasRestrictedAncestor(pageId))
    ) {
      await this.broadcastToAuthorizedUsers(
        room,
        data.spaceId,
        client.id,
        pageId,
        data,
      );
      return;
    }

    await this.broadcastToAuthorizedUsers(
      room,
      data.spaceId,
      client.id,
      null,
      data,
    );
  }

  async invalidateSpaceRestrictionCache(spaceId: string): Promise<void> {
    await this.cacheManager.del(
      `${WS_SPACE_RESTRICTION_CACHE_PREFIX}${spaceId}`,
    );
  }

  async emitCommentEvent(
    spaceId: string,
    pageId: string,
    data: any,
  ): Promise<void> {
    const room = getSpaceRoomName(spaceId);
    const isRestricted =
      (await this.spaceHasRestrictions(spaceId)) &&
      (await this.pagePermissionRepo.hasRestrictedAncestor(pageId));

    await this.broadcastToAuthorizedUsers(
      room,
      spaceId,
      null,
      isRestricted ? pageId : null,
      data,
    );
  }

  async emitToUsers(userIds: string[], data: any): Promise<void> {
    if (userIds.length === 0) return;
    const rooms = userIds.map((id) => getUserRoomName(id));
    this.server.to(rooms).emit('message', data);
  }

  async emitToSpaceExceptUsers(
    spaceId: string,
    excludeUserIds: string[],
    data: any,
  ): Promise<void> {
    const room = getSpaceRoomName(spaceId);
    const sockets = await this.server.in(room).fetchSockets();
    const excludeSet = new Set(excludeUserIds);

    for (const socket of sockets) {
      const userId = socket.data.userId as string;
      if (
        userId &&
        !excludeSet.has(userId) &&
        (await this.getAuthorizedUser(socket, spaceId))
      ) {
        socket.emit('message', data);
      }
    }
  }

  isTreeEvent(data: any): boolean {
    return TREE_EVENTS.has(data?.operation) && !!data?.spaceId;
  }

  private async broadcastToAuthorizedUsers(
    room: string,
    spaceId: string,
    excludeSocketId: string | null,
    pageId: string | null,
    data: any,
  ): Promise<void> {
    const sockets = await this.server.in(room).fetchSockets();

    // Exclude only the originating socket, not every socket of the originating
    // user. Excluding by userId silently dropped the originator's other tabs
    // from receiving restricted-space tree events.
    const otherSockets = excludeSocketId
      ? sockets.filter((s) => s.id !== excludeSocketId)
      : sockets;
    if (otherSockets.length === 0) return;

    const userSocketMap = new Map<string, typeof otherSockets>();
    for (const socket of otherSockets) {
      const userId = socket.data.userId as string;
      if (!userId) continue;
      const existing = userSocketMap.get(userId);
      if (existing) {
        existing.push(socket);
      } else {
        userSocketMap.set(userId, [socket]);
      }
    }

    const authorizedUserIds: string[] = [];
    const explicitUserIds: string[] = [];
    for (const userId of userSocketMap.keys()) {
      const user = await this.getAuthorizedUser(
        userSocketMap.get(userId)?.[0],
        spaceId,
      );
      if (!user) continue;

      const permission = await this.spaceAuthorization.resolve(user, spaceId);
      if (!permission) continue;

      // Workspace and Team administrators inherit access to every page in the
      // space. Explicitly permissioned members still need page-level access
      // for restricted ancestors.
      if (
        !pageId ||
        permission.source === 'workspace-admin' ||
        permission.source === 'team-admin'
      ) {
        authorizedUserIds.push(userId);
      } else {
        explicitUserIds.push(userId);
      }
    }

    if (pageId && explicitUserIds.length > 0) {
      authorizedUserIds.push(
        ...(await this.pagePermissionRepo.getUserIdsWithPageAccess(
          pageId,
          explicitUserIds,
        )),
      );
    }

    const authorizedSet = new Set(authorizedUserIds);
    for (const [userId, userSockets] of userSocketMap) {
      if (authorizedSet.has(userId)) {
        for (const socket of userSockets) {
          socket.emit('message', data);
        }
      }
    }
  }

  private async getAuthorizedUser(
    socket: Pick<Socket, 'data'> | undefined,
    spaceId: string,
  ): Promise<User | undefined> {
    const userId = socket?.data?.userId as string | undefined;
    const workspaceId = socket?.data?.workspaceId as string | undefined;
    if (!userId || !workspaceId) return undefined;

    const user = await this.userRepo.findById(userId, workspaceId);
    if (!user || user.deletedAt || user.deactivatedAt) return undefined;

    const permission = await this.spaceAuthorization.resolve(user, spaceId);
    return permission?.canView ? user : undefined;
  }

  private async spaceHasRestrictions(spaceId: string): Promise<boolean> {
    const cacheKey = `${WS_SPACE_RESTRICTION_CACHE_PREFIX}${spaceId}`;

    const cached = await this.cacheManager.get<boolean>(cacheKey);
    if (cached !== undefined && cached !== null) {
      return cached;
    }

    const hasRestrictions =
      await this.pagePermissionRepo.hasRestrictedPagesInSpace(spaceId);

    await this.cacheManager.set(cacheKey, hasRestrictions, WS_CACHE_TTL_MS);

    return hasRestrictions;
  }

  private extractPageId(data: any): string | null {
    switch (data.operation) {
      case 'addTreeNode':
        return data.payload?.data?.id ?? null;
      case 'moveTreeNode':
        return data.payload?.id ?? null;
      case 'deleteTreeNode':
        return data.payload?.node?.id ?? null;
      case 'updateOne':
        return data.id ?? null;
      default:
        return null;
    }
  }
}
