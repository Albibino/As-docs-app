import { Inject, Injectable } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Cache } from 'cache-manager';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { sql } from 'kysely';
import { PaginationOptions } from '../../pagination/pagination-options';
import { UserSpaceRole } from './types';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { withCache } from '../../../common/helpers/with-cache';
import {
  CacheKey,
  PERMISSION_CACHE_TTL_MS,
} from '../../../common/helpers/cache-keys';
import { TeamRole } from '../../../common/helpers/types/permission';

/**
 * Compatibility read repository for services that still need space-scoped
 * queries. Membership mutations live in the Team and SpacePermission
 * services; the legacy space_members table is no longer part of the model.
 */
@Injectable()
export class SpaceMemberRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceRepo: SpaceRepo,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async getUserSpaceRoles(
    userId: string,
    spaceId: string,
  ): Promise<UserSpaceRole[]> {
    return withCache(
      this.cacheManager,
      CacheKey.SPACE_ROLES(userId, spaceId),
      PERMISSION_CACHE_TTL_MS,
      async () => {
        const roles = await this.db
          .selectFrom('spaces')
          .innerJoin('users', (join) =>
            join
              .on('users.id', '=', userId)
              .onRef('users.workspaceId', '=', 'spaces.workspaceId'),
          )
          .leftJoin('teamMembers', (join) =>
            join
              .onRef('teamMembers.teamId', '=', 'spaces.teamId')
              .on('teamMembers.userId', '=', userId),
          )
          .leftJoin('spacePermissions', (join) =>
            join
              .onRef('spacePermissions.spaceId', '=', 'spaces.id')
              .on('spacePermissions.userId', '=', userId),
          )
          .select(sql<string>`${userId}::uuid`.as('userId'))
          .select(
            sql<string>`case
              when users.role in ('owner', 'admin') then 'admin'
              when team_members.role = 'admin' then 'admin'
              when space_permissions.can_edit = true then 'writer'
              when space_permissions.can_view = true then 'reader'
            end`.as('role'),
          )
          .where('users.deletedAt', 'is', null)
          .where('users.deactivatedAt', 'is', null)
          .where('spaces.id', '=', spaceId)
          .where('spaces.deletedAt', 'is', null)
          .where('spaces.archivedAt', 'is', null)
          .where((eb) =>
            eb.or([
              eb('users.role', 'in', ['owner', 'admin']),
              eb('teamMembers.role', '=', TeamRole.ADMIN),
              eb('spacePermissions.canView', '=', true),
            ]),
          )
          .execute();

        if (roles.length === 0) return undefined;
        return roles;
      },
    );
  }

  async invalidateUserSpaceRoles(
    userIds: string[],
    spaceIds: string[],
  ): Promise<void> {
    await Promise.all(
      userIds.flatMap((userId) =>
        spaceIds.map((spaceId) =>
          this.cacheManager.del(CacheKey.SPACE_ROLES(userId, spaceId)),
        ),
      ),
    );
  }

  async invalidateSpaceRoles(spaceId: string): Promise<void> {
    const members = await this.db
      .selectFrom('spaces')
      .innerJoin('teamMembers', 'teamMembers.teamId', 'spaces.teamId')
      .select('teamMembers.userId')
      .where('spaces.id', '=', spaceId)
      .execute();

    await this.invalidateUserSpaceRoles(
      members.map(({ userId }) => userId),
      [spaceId],
    );
  }

  async invalidateUserWorkspaceSpaceRoles(
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const spaces = await this.db
      .selectFrom('spaces')
      .select('id')
      .where('workspaceId', '=', workspaceId)
      .execute();

    await this.invalidateUserSpaceRoles(
      [userId],
      spaces.map(({ id }) => id),
    );
  }

  async getUserIdsWithSpaceAccess(
    userIds: string[],
    spaceId: string,
  ): Promise<Set<string>> {
    if (userIds.length === 0) return new Set();

    const rows = await this.db
      .selectFrom('users')
      .innerJoin('spaces', 'spaces.workspaceId', 'users.workspaceId')
      .select('users.id as userId')
      .where('users.id', 'in', userIds)
      .where('spaces.id', '=', spaceId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where('spaces.deletedAt', 'is', null)
      .where(
        sql<boolean>`(
        users.role in ('owner', 'admin')
        or exists (
          select 1
          from team_members tm
          left join space_permissions sp
            on sp.space_id = spaces.id
           and sp.user_id = tm.user_id
          where tm.team_id = spaces.team_id
            and tm.user_id = users.id
            and (tm.role = 'admin' or sp.can_view = true)
        )
      )`,
      )
      .execute();

    return new Set(rows.map((row) => row.userId));
  }

  getUserSpaceIdsQuery(userId: string) {
    return this.db
      .selectFrom('spaces')
      .select('spaces.id')
      .where('spaces.archivedAt', 'is', null)
      .where('spaces.deletedAt', 'is', null)
      .where(sql<boolean>`EXISTS (
        SELECT 1
        FROM users active_user
        WHERE active_user.id = ${userId}
          AND active_user.workspace_id = spaces.workspace_id
          AND active_user.deleted_at IS NULL
          AND active_user.deactivated_at IS NULL
      )`)
      .where(sql<boolean>`(
        exists (
          select 1
          from users u
          where u.id = ${userId}
            and u.workspace_id = spaces.workspace_id
            and u.role in ('owner', 'admin')
            and u.deleted_at is null
            and u.deactivated_at is null
        )
        or exists (
          select 1
          from team_members tm
          left join space_permissions sp
            on sp.space_id = spaces.id
           and sp.user_id = tm.user_id
          where tm.team_id = spaces.team_id
            and tm.user_id = ${userId}
            and (tm.role = 'admin' or sp.can_view = true)
        )
      )`);
  }

  async getUserSpaceIds(userId: string): Promise<string[]> {
    const spaces = await this.getUserSpaceIdsQuery(userId).execute();
    return spaces.map((space) => space.id);
  }

  async getUserRolesForSpaces(
    userId: string,
    spaceIds: string[],
  ): Promise<{ spaceId: string; role: string }[]> {
    if (spaceIds.length === 0) return [];

    return this.db
      .selectFrom('spaces')
      .innerJoin('users', (join) =>
        join
          .on('users.id', '=', userId)
          .onRef('users.workspaceId', '=', 'spaces.workspaceId'),
      )
      .leftJoin('teamMembers', (join) =>
        join
          .onRef('teamMembers.teamId', '=', 'spaces.teamId')
          .on('teamMembers.userId', '=', userId),
      )
      .leftJoin('spacePermissions', (join) =>
        join
          .onRef('spacePermissions.spaceId', '=', 'spaces.id')
          .on('spacePermissions.userId', '=', userId),
      )
      .select('spaces.id as spaceId')
      .select(
        sql<string>`case
          when users.role in ('owner', 'admin') then 'admin'
          when team_members.role = 'admin' then 'admin'
          when space_permissions.can_edit = true then 'writer'
          when space_permissions.can_view = true then 'reader'
        end`.as('role'),
      )
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where('spaces.id', 'in', spaceIds)
      .where('spaces.deletedAt', 'is', null)
      .where('spaces.archivedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('users.role', 'in', ['owner', 'admin']),
          eb('teamMembers.role', '=', TeamRole.ADMIN),
          eb('spacePermissions.canView', '=', true),
        ]),
      )
      .execute();
  }

  async getUserSpaces(
    userId: string,
    pagination: PaginationOptions,
    opts?: { allWorkspaceSpaces?: { workspaceId: string } },
  ) {
    let query = this.db
      .selectFrom('spaces')
      .selectAll()
      .select((eb) => [this.spaceRepo.withMemberCount(eb)]);

    query = opts?.allWorkspaceSpaces
      ? query
          .where('workspaceId', '=', opts.allWorkspaceSpaces.workspaceId)
          .where('deletedAt', 'is', null)
          .where((eb) =>
            eb('isPersonal', '=', false).or(
              'id',
              'in',
              this.getUserSpaceIdsQuery(userId),
            ),
          )
      : query.where('id', 'in', this.getUserSpaceIdsQuery(userId));

    if (pagination.query) {
      query = query.where((eb) =>
        eb(
          sql`f_unaccent(name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or(
          sql`f_unaccent(description)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ),
      );
    }

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'name', direction: 'asc' },
        { expression: 'id', direction: 'asc' },
      ],
      parseCursor: (cursor) => ({ name: cursor.name, id: cursor.id }),
    });
  }
}
