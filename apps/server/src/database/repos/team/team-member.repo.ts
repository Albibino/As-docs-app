import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { TeamRole } from '../../../common/helpers/types/permission';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { TeamRepo } from '@tcc-docs/db/repos/team/team.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { InsertableTeamMember, TeamMember } from '@tcc-docs/db/types/entity.types';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx, executeTx } from '@tcc-docs/db/utils';

@Injectable()
export class TeamMemberRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly teamRepo: TeamRepo,
    private readonly userRepo: UserRepo,
  ) {}

  async findMembership(
    userId: string,
    teamId: string,
    trx?: KyselyTransaction,
  ): Promise<TeamMember> {
    const db = dbOrTx(this.db, trx);

    return db
      .selectFrom('teamMembers')
      .selectAll()
      .where('userId', '=', userId)
      .where('teamId', '=', teamId)
      .executeTakeFirst();
  }

  async getMembersPaginated(
    teamId: string,
    workspaceId: string,
    pagination: PaginationOptions,
    opts?: { trx?: KyselyTransaction },
  ) {
    const db = dbOrTx(this.db, opts?.trx);
    let baseQuery = db
      .selectFrom('teamMembers')
      .innerJoin('teams', 'teams.id', 'teamMembers.teamId')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .select([
        'teamMembers.id as membershipId',
        'teamMembers.role',
        'teamMembers.createdAt',
        'users.id as userId',
        'users.name',
        'users.email',
        'users.avatarUrl',
        'users.deactivatedAt',
      ])
      .where('teamMembers.teamId', '=', teamId)
      .where('teams.workspaceId', '=', workspaceId)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null);

    if (pagination.query) {
      baseQuery = baseQuery.where((eb) =>
        eb(
          sql`f_unaccent(users.name)`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or(
          sql`users.email`,
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
        { expression: 'sub.userId', direction: 'asc', key: 'userId' },
      ],
      parseCursor: (cursor) => ({
        name: cursor.name,
        userId: cursor.userId,
      }),
    });
  }

  async countAdmins(teamId: string, trx?: KyselyTransaction): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .selectFrom('teamMembers')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('teamId', '=', teamId)
      // Both team_members and users have a role column. Qualifying this
      // predicate is required whenever the active-user join is present.
      .where('teamMembers.role', '=', TeamRole.ADMIN)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .executeTakeFirst();

    return result?.count ?? 0;
  }

  async getActiveMemberIds(
    teamId: string,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    const db = dbOrTx(this.db, trx);
    const members = await db
      .selectFrom('teamMembers')
      .innerJoin('users', 'users.id', 'teamMembers.userId')
      .select('teamMembers.userId')
      .where('teamMembers.teamId', '=', teamId)
      .where('teamMembers.role', '=', TeamRole.MEMBER)
      .where('users.deletedAt', 'is', null)
      .where('users.deactivatedAt', 'is', null)
      .execute();

    return members.map(({ userId }) => userId);
  }

  async add(
    userId: string,
    teamId: string,
    workspaceId: string,
    role: TeamRole = TeamRole.MEMBER,
    addedById?: string,
    trx?: KyselyTransaction,
  ): Promise<TeamMember> {
    return executeTx(
      this.db,
      async (transaction) => {
        const [team, user, membership] = await Promise.all([
          this.teamRepo.findById(teamId, workspaceId, { trx: transaction }),
          this.userRepo.findById(userId, workspaceId, { trx: transaction }),
          this.findMembership(userId, teamId, transaction),
        ]);

        if (!team) {
          throw new NotFoundException('Team not found');
        }

        if (!user) {
          throw new NotFoundException('User not found');
        }

        if (membership) {
          throw new BadRequestException(
            'User is already a member of this team',
          );
        }

        return this.insertMember(
          { userId, teamId, role, addedById },
          transaction,
        );
      },
      trx,
    );
  }

  async insertMember(
    insertableTeamMember: InsertableTeamMember,
    trx?: KyselyTransaction,
  ): Promise<TeamMember> {
    const db = dbOrTx(this.db, trx);

    return db
      .insertInto('teamMembers')
      .values(insertableTeamMember)
      .returningAll()
      .executeTakeFirst();
  }

  async updateRole(
    userId: string,
    teamId: string,
    role: TeamRole,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .updateTable('teamMembers')
      .set({ role, updatedAt: new Date() })
      .where('userId', '=', userId)
      .where('teamId', '=', teamId)
      .execute();
  }

  async remove(
    userId: string,
    teamId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);

    await db
      .deleteFrom('teamMembers')
      .where('userId', '=', userId)
      .where('teamId', '=', teamId)
      .execute();
  }

}
