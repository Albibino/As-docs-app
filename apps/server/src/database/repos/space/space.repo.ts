import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import {
  InsertableSpace,
  Space,
  UpdatableSpace,
} from '@tcc-docs/db/types/entity.types';
import { ExpressionBuilder, sql } from 'kysely';
import { PaginationOptions } from '../../pagination/pagination-options';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import { DB } from '@tcc-docs/db/types/db';
import { validate as isValidUUID } from 'uuid';
import { TeamRole } from '../../../common/helpers/types/permission';

@Injectable()
export class SpaceRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    spaceId: string,
    workspaceId: string,
    opts?: { includeMemberCount?: boolean; trx?: KyselyTransaction },
  ): Promise<Space> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('spaces')
      .selectAll('spaces')
      .$if(opts?.includeMemberCount, (qb) => qb.select(this.withMemberCount))
      .where('workspaceId', '=', workspaceId);

    if (isValidUUID(spaceId)) {
      query = query.where('id', '=', spaceId);
    } else {
      query = query.where(sql`LOWER(slug)`, '=', sql`LOWER(${spaceId})`);
    }
    return query.executeTakeFirst();
  }

  async findBySlug(
    slug: string,
    workspaceId: string,
    opts?: { includeMemberCount: boolean },
  ): Promise<Space> {
    return await this.db
      .selectFrom('spaces')
      .selectAll('spaces')
      .$if(opts?.includeMemberCount, (qb) => qb.select(this.withMemberCount))
      .where(sql`LOWER(slug)`, '=', sql`LOWER(${slug})`)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async findPersonalSpace(
    userId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Space | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('spaces')
      .selectAll('spaces')
      .where('workspaceId', '=', workspaceId)
      .where('creatorId', '=', userId)
      .where('isPersonal', '=', true)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async slugExists(
    slug: string,
    workspaceId: string,
    trx?: KyselyTransaction,
    excludeSpaceId?: string,
  ): Promise<boolean> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('spaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .where(sql`LOWER(slug)`, '=', sql`LOWER(${slug})`)
      .where('workspaceId', '=', workspaceId);

    if (excludeSpaceId) {
      query = query.where('id', '!=', excludeSpaceId);
    }

    let { count } = await query.executeTakeFirst();
    count = count as number;
    return count != 0;
  }

  async updateSpace(
    updatableSpace: UpdatableSpace,
    spaceId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('spaces')
      .set({ ...updatableSpace, updatedAt: new Date() })
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async updateCommentSettings(
    spaceId: string,
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('spaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
          || jsonb_build_object('comments', COALESCE(settings->'comments', '{}'::jsonb)
          || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async insertSpace(
    insertableSpace: InsertableSpace,
    trx?: KyselyTransaction,
  ): Promise<Space> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('spaces')
      .values(insertableSpace)
      .returningAll()
      .executeTakeFirst();
  }

  async getSpacesInWorkspace(
    workspaceId: string,
    pagination: PaginationOptions,
    opts?: {
      userId?: string;
      teamId?: string;
      archived?: boolean;
    },
  ) {
    let query = this.db
      .selectFrom('spaces')
      .selectAll('spaces')
      .select((eb) => [this.withMemberCount(eb)])
      .where('workspaceId', '=', workspaceId)
      .where('deletedAt', 'is', null);

    query = opts?.archived
      ? query.where('archivedAt', 'is not', null)
      : query.where('archivedAt', 'is', null);

    if (opts?.teamId) query = query.where('teamId', '=', opts.teamId);
    if (opts?.userId) {
      query = query.where(
        sql<boolean>`exists (
          select 1
          from users access_user
          where access_user.id = ${opts.userId}::uuid
            and access_user.workspace_id = spaces.workspace_id
            and access_user.deleted_at is null
            and access_user.deactivated_at is null
        )`,
      );
      query = query.where(
        opts.archived
          ? sql<boolean>`exists (
              select 1
              from team_members tm
              where tm.team_id = spaces.team_id
                and tm.user_id = ${opts.userId}
                and tm.role = 'admin'
            )`
          : sql<boolean>`exists (
              select 1
              from team_members tm
              where tm.team_id = spaces.team_id
                and tm.user_id = ${opts.userId}
                and (
                  tm.role = 'admin'
                  or exists (
                    select 1
                    from space_permissions sp
                    where sp.space_id = spaces.id
                      and sp.user_id = ${opts.userId}
                      and sp.can_view = true
                  )
                )
            ) OR exists (
              select 1
              from pages shared_page
              join page_access shared_access on shared_access.page_id = shared_page.id
              join page_permissions shared_permission on shared_permission.page_access_id = shared_access.id
              where shared_page.space_id = spaces.id
                and shared_page.deleted_at is null
                and shared_permission.can_view = true
                and (
                  shared_permission.user_id = ${opts.userId}::uuid
                  or shared_permission.workspace_wide = true
                  or exists (
                    select 1 from team_members shared_target_team
                    where shared_target_team.team_id = shared_permission.team_id
                      and shared_target_team.user_id = ${opts.userId}::uuid
                  )
                )
            )`,
      );
    }

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

  withMemberCount(eb: ExpressionBuilder<DB, 'spaces'>) {
    return eb
      .selectFrom('teamMembers')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .leftJoin('spacePermissions', (join) =>
        join
          .onRef('spacePermissions.userId', '=', 'teamMembers.userId')
          .onRef('spacePermissions.spaceId', '=', 'spaces.id'),
      )
      .select((eb) => eb.fn.count('teamMembers.userId').as('count'))
      .whereRef('teamMembers.teamId', '=', 'spaces.teamId')
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .where((eb) =>
        eb.or([
          eb('teamMembers.role', '=', TeamRole.ADMIN),
          eb('spacePermissions.canView', '=', true),
        ]),
      )
      .as('memberCount');
  }

  async archiveSpace(
    spaceId: string,
    workspaceId: string,
    archivedById: string,
  ): Promise<void> {
    await this.db
      .updateTable('spaces')
      .set({ archivedAt: new Date(), archivedById, updatedAt: new Date() })
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  async restoreSpace(spaceId: string, workspaceId: string): Promise<void> {
    await this.db
      .updateTable('spaces')
      .set({ archivedAt: null, archivedById: null, updatedAt: new Date() })
      .where('id', '=', spaceId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }
}
