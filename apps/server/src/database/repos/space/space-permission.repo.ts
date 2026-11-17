import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import {
  InsertableSpacePermission,
  SpacePermissionRecord,
} from '@tcc-docs/db/types/entity.types';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithCursorPagination } from '../../pagination/cursor-pagination';
import { sql } from 'kysely';

export type SpacePermissionInput = Pick<
  InsertableSpacePermission,
  'userId' | 'canView' | 'canCreate' | 'canEdit' | 'canDelete'
>;

@Injectable()
export class SpacePermissionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  findForUser(
    spaceId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<SpacePermissionRecord> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('spacePermissions')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  findForUsers(
    spaceId: string,
    userIds: string[],
    trx?: KyselyTransaction,
  ): Promise<SpacePermissionRecord[]> {
    if (userIds.length === 0) return Promise.resolve([]);
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('spacePermissions')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .where('userId', 'in', userIds)
      .execute();
  }

  findForSpace(
    spaceId: string,
    trx?: KyselyTransaction,
  ): Promise<SpacePermissionRecord[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('spacePermissions')
      .selectAll()
      .where('spaceId', '=', spaceId)
      .execute();
  }

  async deleteExceptUsers(
    spaceId: string,
    userIds: string[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .deleteFrom('spacePermissions')
      .where('spaceId', '=', spaceId);

    if (userIds.length > 0) {
      query = query.where('userId', 'not in', userIds);
    }

    await query.execute();
  }

  async grantDefaultAccessForTeamMember(
    teamId: string,
    userId: string,
    grantedById: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    const spaces = await db
      .selectFrom('spaces')
      .select('id')
      .where('teamId', '=', teamId)
      .where('deletedAt', 'is', null)
      .where('archivedAt', 'is', null)
      .execute();

    if (spaces.length === 0) return;

    await db
      .insertInto('spacePermissions')
      .values(
        spaces.map(({ id: spaceId }) => ({
          spaceId,
          userId,
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
          grantedById,
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(['spaceId', 'userId']).doNothing(),
      )
      .execute();
  }

  async upsertBatch(
    spaceId: string,
    permissions: SpacePermissionInput[],
    grantedById: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    if (permissions.length === 0) return;
    await db
      .insertInto('spacePermissions')
      .values(
        permissions.map((permission) => ({
          ...permission,
          spaceId,
          grantedById,
        })),
      )
      .onConflict((conflict) =>
        conflict.columns(['spaceId', 'userId']).doUpdateSet((eb) => ({
          canView: eb.ref('excluded.canView'),
          canCreate: eb.ref('excluded.canCreate'),
          canEdit: eb.ref('excluded.canEdit'),
          canDelete: eb.ref('excluded.canDelete'),
          grantedById: eb.ref('excluded.grantedById'),
          updatedAt: new Date(),
        })),
      )
      .execute();
  }

  async getPermissionMatrix(
    spaceId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    let baseQuery = this.db
      .selectFrom('spaces')
      .innerJoin('teams', 'teams.id', 'spaces.teamId')
      .innerJoin('teamMembers', 'teamMembers.teamId', 'teams.id')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .leftJoin('spacePermissions', (join) =>
        join
          .onRef('spacePermissions.spaceId', '=', 'spaces.id')
          .onRef('spacePermissions.userId', '=', 'users.id'),
      )
      .select([
        'users.id as userId',
        'users.name',
        'users.email',
        'users.avatarUrl',
        'teamMembers.role as teamRole',
      ])
      .select([
        sql<boolean>`case when team_members.role = 'admin' then true else coalesce(space_permissions.can_view, false) end`.as(
          'canView',
        ),
        sql<boolean>`case when team_members.role = 'admin' then true else coalesce(space_permissions.can_create, false) end`.as(
          'canCreate',
        ),
        sql<boolean>`case when team_members.role = 'admin' then true else coalesce(space_permissions.can_edit, false) end`.as(
          'canEdit',
        ),
        sql<boolean>`case when team_members.role = 'admin' then true else coalesce(space_permissions.can_delete, false) end`.as(
          'canDelete',
        ),
        sql<string>`case when team_members.role = 'admin' then 'team-admin' else 'explicit' end`.as(
          'source',
        ),
      ])
      .where('spaces.id', '=', spaceId)
      .where('spaces.workspaceId', '=', workspaceId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null);

    if (pagination.query) {
      baseQuery = baseQuery.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or('users.email', 'ilike', '%' + pagination.query + '%'),
      );
    }

    const query = this.db.selectFrom(baseQuery.as('sub')).selectAll('sub');
    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'sub.name', direction: 'asc', key: 'name' },
        { expression: 'sub.userId', direction: 'asc', key: 'userId' },
      ],
      parseCursor: (cursor) => ({ name: cursor.name, userId: cursor.userId }),
    });
  }

  async getAccessibleMembers(
    spaceId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    let baseQuery = this.db
      .selectFrom('spaces')
      .innerJoin('teams', 'teams.id', 'spaces.teamId')
      .innerJoin('teamMembers', 'teamMembers.teamId', 'teams.id')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .leftJoin('spacePermissions', (join) =>
        join
          .onRef('spacePermissions.spaceId', '=', 'spaces.id')
          .onRef('spacePermissions.userId', '=', 'users.id'),
      )
      .select([
        'users.id as id',
        'users.name',
        'users.email',
        'users.avatarUrl',
        sql<string>`case
          when team_members.role = 'admin' then 'admin'
          when space_permissions.can_edit = true then 'writer'
          else 'reader'
        end`.as('role'),
        sql<string>`'user'`.as('type'),
      ])
      .where('spaces.id', '=', spaceId)
      .where('spaces.workspaceId', '=', workspaceId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('teamMembers.role', '=', 'admin'),
          eb('spacePermissions.canView', '=', true),
        ]),
      );

    if (pagination.query) {
      baseQuery = baseQuery.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or('users.email', 'ilike', '%' + pagination.query + '%'),
      );
    }

    const query = this.db.selectFrom(baseQuery.as('sub')).selectAll('sub');
    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [
        { expression: 'sub.name', direction: 'asc', key: 'name' },
        { expression: 'sub.id', direction: 'asc', key: 'id' },
      ],
      parseCursor: (cursor) => ({ name: cursor.name, id: cursor.id }),
    });
  }

  async deleteByUser(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('spacePermissions')
      .where('userId', '=', userId)
      .where(
        'spaceId',
        'in',
        db
          .selectFrom('spaces')
          .select('id')
          .where('workspaceId', '=', workspaceId),
      )
      .execute();
  }
}
