import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder, sql } from 'kysely';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import {
  InsertableTeam,
  Team,
  UpdatableTeam,
} from '@tcc-docs/db/types/entity.types';
import { DB, Teams } from '@tcc-docs/db/types/db';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';

export type TeamWithMembersCount = Team & {
  membersCount: number;
  spacesCount: number;
};

@Injectable()
export class TeamRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  private readonly baseFields: Array<keyof Teams> = [
    'id',
    'workspaceId',
    'name',
    'description',
    'creatorId',
    'createdAt',
    'updatedAt',
  ];

  async findById(
    teamId: string,
    workspaceId: string,
    opts?: {
      includeMemberCount?: boolean;
      forUpdate?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<TeamWithMembersCount> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('teams')
      .select(this.baseFields)
      .select(this.withMembersCount)
      .select(this.withSpacesCount)
      .where('id', '=', teamId)
      .where('workspaceId', '=', workspaceId)
      .$if(opts?.forUpdate === true, (qb) => qb.forUpdate())
      .executeTakeFirst();
  }

  async findByName(
    name: string,
    workspaceId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<TeamWithMembersCount> {
    const db = dbOrTx(this.db, opts?.trx);

    return db
      .selectFrom('teams')
      .select(this.baseFields)
      .select(this.withMembersCount)
      .select(this.withSpacesCount)
      .where(sql`LOWER(name)`, '=', sql`LOWER(${name})`)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async hasSharedPageAccess(teamId: string, userId: string): Promise<boolean> {
    const result = await sql<{ allowed: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM spaces shared_space
        JOIN pages shared_page ON shared_page.space_id = shared_space.id
        JOIN page_access shared_access ON shared_access.page_id = shared_page.id
        JOIN page_permissions shared_permission ON shared_permission.page_access_id = shared_access.id
        WHERE shared_space.team_id = ${teamId}::uuid
          AND shared_space.deleted_at IS NULL
          AND shared_page.deleted_at IS NULL
          AND shared_permission.can_view = true
          AND (
            shared_permission.user_id = ${userId}::uuid
            OR shared_permission.workspace_wide = true
            OR EXISTS (
              SELECT 1 FROM team_members target_team
              WHERE target_team.team_id = shared_permission.team_id
                AND target_team.user_id = ${userId}::uuid
            )
          )
      ) AS allowed
    `.execute(this.db);
    return Boolean(result.rows[0]?.allowed);
  }

  async getTeamsPaginated(
    workspaceId: string,
    pagination: PaginationOptions,
    userId?: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    let baseQuery = db
      .selectFrom('teams')
      .select(this.baseFields)
      .select(this.withMembersCount)
      .select(this.withSpacesCount)
      .select((eb) =>
        userId
          ? eb
              .exists(
                eb
                  .selectFrom('teamMembers')
                  .select('teamMembers.id')
                  .whereRef('teamMembers.teamId', '=', 'teams.id')
                  .where('teamMembers.userId', '=', userId)
                  .where('teamMembers.role', '=', 'admin'),
              )
              .as('isAdmin')
          : sql<boolean>`true`.as('isAdmin'),
      )
      .select((eb) =>
        userId
          ? eb
              .exists(
                eb
                  .selectFrom('teamMembers')
                  .select('teamMembers.id')
                  .whereRef('teamMembers.teamId', '=', 'teams.id')
                  .where('teamMembers.userId', '=', userId),
              )
              .as('isMember')
          : sql<boolean>`true`.as('isMember'),
      )
      .where('workspaceId', '=', workspaceId);

    if (userId) {
      baseQuery = baseQuery.where(sql<boolean>`
        EXISTS (
          SELECT 1 FROM team_members member_team
          WHERE member_team.team_id = teams.id
            AND member_team.user_id = ${userId}::uuid
        )
        OR EXISTS (
          SELECT 1
          FROM spaces shared_space
          JOIN pages shared_page ON shared_page.space_id = shared_space.id
          JOIN page_access shared_access ON shared_access.page_id = shared_page.id
          JOIN page_permissions shared_permission ON shared_permission.page_access_id = shared_access.id
          WHERE shared_space.team_id = teams.id
            AND shared_space.deleted_at IS NULL
            AND shared_page.deleted_at IS NULL
            AND shared_permission.can_view = true
            AND (
              shared_permission.user_id = ${userId}::uuid
              OR shared_permission.workspace_wide = true
              OR EXISTS (
                SELECT 1 FROM team_members shared_target_team
                WHERE shared_target_team.team_id = shared_permission.team_id
                  AND shared_target_team.user_id = ${userId}::uuid
              )
            )
        )
      `);
    }

    if (pagination.query) {
      baseQuery = baseQuery.where((eb) =>
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

    const query = db.selectFrom(baseQuery.as('sub')).selectAll('sub');

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

  async insert(
    insertableTeam: InsertableTeam,
    trx?: KyselyTransaction,
  ): Promise<Team> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('teams')
      .values(insertableTeam)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async update(
    updatableTeam: UpdatableTeam,
    teamId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .updateTable('teams')
      .set({ ...updatableTeam, updatedAt: new Date() })
      .where('id', '=', teamId)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  withMembersCount(eb: ExpressionBuilder<DB, 'teams'>) {
    return eb
      .selectFrom('teamMembers')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .whereRef('teamMembers.teamId', '=', 'teams.id')
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .as('membersCount');
  }

  withSpacesCount(eb: ExpressionBuilder<DB, 'teams'>) {
    return eb
      .selectFrom('spaces')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .whereRef('spaces.teamId', '=', 'teams.id')
      .where('spaces.deletedAt', 'is', null)
      .as('spacesCount');
  }
}
