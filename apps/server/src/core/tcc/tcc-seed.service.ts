import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { TeamRepo } from '@tcc-docs/db/repos/team/team.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { Space, Team, User, Workspace } from '@tcc-docs/db/types/entity.types';
import { TeamRole, UserRole } from '../../common/helpers/types/permission';
import { TCC_SPACE, TCC_TEAM, TCC_USERS, TCC_WORKSPACE } from './tcc.constants';

export interface TccIdentity {
  workspace: Workspace;
  team: Team;
  space: Space;
  users: User[];
}

/**
 * Garante, a cada boot, a identidade fixa do TCC: 1 workspace, 1 time, 1 space
 * e os usuários "Usuário 1" e "Usuário 2". É idempotente — rodar de novo não
 * duplica nada — e não depende de cadastro, convite nem provedor externo.
 *
 * Os dois usuários são administradores do workspace: com permissões iguais, a
 * edição simultânea do mesmo documento funciona sem configuração extra.
 */
@Injectable()
export class TccSeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(TccSeedService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly workspaceRepo: WorkspaceRepo,
    private readonly userRepo: UserRepo,
    private readonly teamRepo: TeamRepo,
    private readonly teamMemberRepo: TeamMemberRepo,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.TCC_SKIP_SEED === 'true') return;
    try {
      const identity = await this.ensure();
      this.logger.log(
        `Identidade TCC pronta: workspace=${identity.workspace.id} space=${identity.space.slug}`,
      );
    } catch (error) {
      // Sem seed o app não tem como entrar; falhar alto evita um app "vazio".
      this.logger.error('Falha ao criar a identidade fixa do TCC', error);
      throw error;
    }
  }

  async ensure(): Promise<TccIdentity> {
    return executeTx(this.db, async (trx) => {
      // Serializa seeds concorrentes (ex.: duas réplicas subindo juntas).
      await trx
        .selectNoFrom((eb) =>
          eb.fn('pg_advisory_xact_lock', [eb.lit(74042026)]).as('locked'),
        )
        .execute();

      let workspace = await trx
        .selectFrom('workspaces')
        .selectAll()
        .orderBy('createdAt', 'asc')
        .limit(1)
        .executeTakeFirst();
      if (!workspace) {
        workspace = await this.workspaceRepo.insertWorkspace(
          {
            name: TCC_WORKSPACE.name,
            hostname: TCC_WORKSPACE.hostname,
            settings: { ai: { generative: true, chat: true } } as any,
          },
          trx,
        );
      }

      const users: User[] = [];
      for (const definition of TCC_USERS) {
        let user = await this.userRepo.findByEmail(
          definition.email,
          workspace.id,
          { trx },
        );
        if (!user) {
          user = await this.userRepo.insertUser(
            {
              name: definition.name,
              email: definition.email,
              password: null,
              role: UserRole.OWNER,
              workspaceId: workspace.id,
              emailVerifiedAt: new Date(),
            },
            trx,
          );
        }
        users.push(user);
      }

      let team: Team = await this.teamRepo.findByName(TCC_TEAM.name, workspace.id, {
        trx,
      });
      if (!team) {
        team = await this.teamRepo.insert(
          {
            workspaceId: workspace.id,
            creatorId: users[0].id,
            name: TCC_TEAM.name,
            description: TCC_TEAM.description,
          },
          trx,
        );
      }
      for (const user of users) {
        const membership = await this.teamMemberRepo.findMembership(
          user.id,
          team.id,
          trx,
        );
        if (!membership) {
          await this.teamMemberRepo.add(
            user.id,
            team.id,
            workspace.id,
            TeamRole.ADMIN,
            users[0].id,
            trx,
          );
        }
      }

      let space = await trx
        .selectFrom('spaces')
        .selectAll()
        .where('workspaceId', '=', workspace.id)
        .where('slug', '=', TCC_SPACE.slug)
        .executeTakeFirst();
      if (!space) {
        space = await this.spaceRepo.insertSpace(
          {
            name: TCC_SPACE.name,
            description: TCC_SPACE.description,
            slug: TCC_SPACE.slug,
            creatorId: users[0].id,
            workspaceId: workspace.id,
            teamId: team.id,
          },
          trx,
        );
      }

      return { workspace, team, space, users } as TccIdentity;
    });
  }
}
