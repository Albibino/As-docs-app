import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { LicenseCheckService } from '../../../integrations/environment/license-check.service';
import { UserSessionRepo } from '@tcc-docs/db/repos/session/user-session.repo';
import { CreateWorkspaceDto } from '../dto/create-workspace.dto';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto';
import { SpaceService } from '../../space/services/space.service';
import { CreateSpaceDto } from '../../space/dto/create-space.dto';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import { InjectKysely } from 'nestjs-kysely';
import { Feature } from '../../../common/features';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { UpdateWorkspaceUserRoleDto } from '../dto/update-workspace-user-role.dto';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { jsonArrayFrom } from 'kysely/helpers/postgres';
import { isAdminActingOnOwner } from '../workspace.util';
import { v4 } from 'uuid';
import { InjectQueue } from '@nestjs/bullmq';
import { QueueJob, QueueName } from '../../../integrations/queue/constants';
import { Queue } from 'bullmq';
import { isPageEmbeddingsTableExists } from '@tcc-docs/db/helpers/helpers';
import { CursorPaginationResult } from '@tcc-docs/db/pagination/cursor-pagination';
import { WatcherRepo } from '@tcc-docs/db/repos/watcher/watcher.repo';
import { FavoriteRepo } from '@tcc-docs/db/repos/favorite/favorite.repo';
import { TeamService } from '../../team/services/team.service';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { normalizePdfExportTheme } from '../../../integrations/export/pdf/pdf-export-theme';

@Injectable()
export class WorkspaceService {
  constructor(
    private workspaceRepo: WorkspaceRepo,
    private spaceService: SpaceService,
    private teamService: TeamService,
    private userRepo: UserRepo,
    private licenseCheckService: LicenseCheckService,
    private watcherRepo: WatcherRepo,
    private favoriteRepo: FavoriteRepo,
    @InjectKysely() private readonly db: KyselyDB,
    @InjectQueue(QueueName.ATTACHMENT_QUEUE) private attachmentQueue: Queue,
    @InjectQueue(QueueName.AI_QUEUE) private aiQueue: Queue,
    private userSessionRepo: UserSessionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async findById(workspaceId: string) {
    return this.workspaceRepo.findById(workspaceId);
  }

  async getWorkspaceInfo(workspaceId: string) {
    const workspace = await this.workspaceRepo.findById(workspaceId);
    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    return workspace;
  }

  async getWorkspacePublicData(workspaceId: string) {
    const workspace = await this.db
      .selectFrom('workspaces')
      .select([
        'id',
        'name',
        'logo',
        'hostname',
        'enforceSso',
        'licenseKey',
        'plan',
      ])
      .select((eb) =>
        jsonArrayFrom(
          eb
            .selectFrom('authProviders')
            .select([
              'authProviders.id',
              'authProviders.name',
              'authProviders.type',
            ])
            .where('authProviders.isEnabled', '=', true)
            .where('workspaceId', '=', workspaceId),
        ).as('authProviders'),
      )
      .where('id', '=', workspaceId)
      .executeTakeFirst();

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const { licenseKey, plan, ...rest } = workspace;

    return rest;
  }

  async create(
    user: User,
    createWorkspaceDto: CreateWorkspaceDto,
    trx?: KyselyTransaction,
  ) {
    const createdWorkspace = await executeTx(
      this.db,
      async (trx) => {
        // create workspace
        const workspace = await this.workspaceRepo.insertWorkspace(
          {
            name: createWorkspaceDto.name,
            description: createWorkspaceDto.description,
          },
          trx,
        );

        // add user to workspace
        await trx
          .updateTable('users')
          .set({
            workspaceId: workspace.id,
            role: UserRole.OWNER,
          })
          .where('users.id', '=', user.id)
          .execute();

        const generalTeam = await this.teamService.createTeam(
          {
            ...user,
            workspaceId: workspace.id,
            role: UserRole.OWNER,
          },
          workspace.id,
          { name: 'General', description: 'General workspace team' },
          trx,
        );

        // create default space
        const spaceInfo: CreateSpaceDto = {
          teamId: generalTeam.id,
          name: 'General',
          slug: 'general',
        };

        await this.spaceService.create(
          user.id,
          workspace.id,
          spaceInfo,
          trx,
        );

        return workspace;
      },
      trx,
    );

    return createdWorkspace;
  }

  async addUserToWorkspace(
    userId: string,
    workspaceId: string,
    assignedRole?: UserRole,
    trx?: KyselyTransaction,
  ): Promise<void> {
    return await executeTx(
      this.db,
      async (trx) => {
        const workspace = await trx
          .selectFrom('workspaces')
          .select(['id', 'defaultRole'])
          .where('workspaces.id', '=', workspaceId)
          .executeTakeFirst();

        if (!workspace) {
          throw new BadRequestException('Workspace not found');
        }

        await trx
          .updateTable('users')
          .set({
            role: assignedRole ?? workspace.defaultRole,
            workspaceId: workspace.id,
          })
          .where('id', '=', userId)
          .execute();
      },
      trx,
    );
  }

  async update(workspaceId: string, updateWorkspaceDto: UpdateWorkspaceDto) {
    if (updateWorkspaceDto.enforceSso) {
      const sso = await this.db
        .selectFrom('authProviders')
        .select(['id'])
        .where('isEnabled', '=', true)
        .where('workspaceId', '=', workspaceId)
        .execute();

      if (sso && sso?.length === 0) {
        throw new BadRequestException(
          'There must be at least one active SSO provider to enforce SSO.',
        );
      }
    }

    if (updateWorkspaceDto.emailDomains) {
      const regex =
        /(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9][a-z0-9-]{0,61}[a-z0-9]/;
      const emailDomains = updateWorkspaceDto.emailDomains || [];
      updateWorkspaceDto.emailDomains = emailDomains
        .map((domain) => regex.exec(domain)?.[0])
        .filter(Boolean);
    }

    if (
      typeof updateWorkspaceDto.trashRetentionDays !== 'undefined' ||
      typeof updateWorkspaceDto.mcpEnabled !== 'undefined' ||
      typeof updateWorkspaceDto.allowPersonalSpaces !== 'undefined'
    ) {
      const ws = await this.db
        .selectFrom('workspaces')
        .select(['id', 'licenseKey', 'plan', 'trashRetentionDays'])
        .where('id', '=', workspaceId)
        .executeTakeFirst();

      if (!ws) {
        throw new NotFoundException('Workspace not found');
      }

      if (typeof updateWorkspaceDto.mcpEnabled !== 'undefined') {
        if (
          !this.licenseCheckService.hasFeature(ws.licenseKey, 'mcp', ws.plan)
        ) {
          throw new ForbiddenException(
            'Feature em desenvolvimento, novidades em breve.',
          );
        }
      }

      if (typeof updateWorkspaceDto.allowPersonalSpaces !== 'undefined') {
        if (
          !this.licenseCheckService.hasFeature(
            ws.licenseKey,
            Feature.PERSONAL_SPACES,
            ws.plan,
          )
        ) {
          throw new ForbiddenException(
            'Feature em desenvolvimento, novidades em breve.',
          );
        }
      }

      if (typeof updateWorkspaceDto.trashRetentionDays !== 'undefined') {
        if (
          !this.licenseCheckService.hasFeature(
            ws.licenseKey,
            Feature.SECURITY_SETTINGS,
            ws.plan,
          )
        ) {
          throw new ForbiddenException(
            'Feature em desenvolvimento, novidades em breve.',
          );
        }
      }

    }

    if (updateWorkspaceDto.aiSearch) {
      const tableExists = await isPageEmbeddingsTableExists(this.db);
      if (!tableExists) {
        throw new BadRequestException(
          'Failed to activate. Make sure pgvector postgres extension is installed.',
        );
      }
    }

    const workspaceBefore = await this.workspaceRepo.findById(workspaceId);
    const settingsBefore = (workspaceBefore?.settings ?? {}) as Record<
      string,
      any
    >;
    const normalizedPdfExport =
      typeof updateWorkspaceDto.pdfExport !== 'undefined'
        ? normalizePdfExportTheme(updateWorkspaceDto.pdfExport)
        : undefined;
    // A busca semântica só enfileira (re)indexação quando o valor muda.
    const aiSearchChanged =
      typeof updateWorkspaceDto.aiSearch !== 'undefined' &&
      (settingsBefore?.ai?.search ?? false) !== updateWorkspaceDto.aiSearch;
    const nextAiSearch = updateWorkspaceDto.aiSearch;

    await executeTx(this.db, async (trx) => {
      if (typeof updateWorkspaceDto.aiSearch !== 'undefined') {
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'search',
          updateWorkspaceDto.aiSearch,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.generativeAi !== 'undefined') {
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'generative',
          updateWorkspaceDto.generativeAi,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.mcpEnabled !== 'undefined') {
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'mcp',
          updateWorkspaceDto.mcpEnabled,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.aiChat !== 'undefined') {
        await this.workspaceRepo.updateAiSettings(
          workspaceId,
          'chat',
          updateWorkspaceDto.aiChat,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.allowPersonalSpaces !== 'undefined') {
        await this.workspaceRepo.updateSpaceSettings(
          workspaceId,
          'allowPersonal',
          updateWorkspaceDto.allowPersonalSpaces,
          trx,
        );
      }

      if (typeof updateWorkspaceDto.defaultPageEditMode !== 'undefined') {
        const next = updateWorkspaceDto.defaultPageEditMode.toLowerCase();
        await this.workspaceRepo.updateDefaultPageEditMode(
          workspaceId,
          next,
          trx,
        );
      }

      if (normalizedPdfExport) {
        await this.workspaceRepo.updatePdfExportSettings(
          workspaceId,
          normalizedPdfExport,
          trx,
        );
      }

      delete updateWorkspaceDto.aiSearch;
      delete updateWorkspaceDto.generativeAi;
      delete updateWorkspaceDto.mcpEnabled;
      delete updateWorkspaceDto.aiChat;
      delete updateWorkspaceDto.allowPersonalSpaces;
      delete updateWorkspaceDto.defaultPageEditMode;
      delete updateWorkspaceDto.pdfExport;

      await this.workspaceRepo.updateWorkspace(
        updateWorkspaceDto,
        workspaceId,
        trx,
      );
    });

    if (aiSearchChanged && nextAiSearch === true) {
      await this.aiQueue.add(QueueJob.WORKSPACE_CREATE_EMBEDDINGS, {
        workspaceId,
      });
    } else if (aiSearchChanged && nextAiSearch === false) {
      const deleteJobId = `ai-search-disabled-${workspaceId}`;
      await this.aiQueue.add(
        QueueJob.WORKSPACE_DELETE_EMBEDDINGS,
        { workspaceId },
        {
          jobId: deleteJobId,
          delay: 24 * 60 * 60 * 1000,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    }

    const workspace = await this.workspaceRepo.findById(workspaceId, {
      withMemberCount: true,
      withLicenseKey: true,
    });

    const { licenseKey, ...rest } = workspace;
    return rest;
  }

  async getWorkspaceUsers(
    workspaceId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<User>> {
    return this.userRepo.getUsersPaginated(workspaceId, pagination);
  }

  async updateWorkspaceUserRole(
    authUser: User,
    userRoleDto: UpdateWorkspaceUserRoleDto,
    workspaceId: string,
  ) {
    const user = await this.userRepo.findById(userRoleDto.userId, workspaceId);

    const newRole = userRoleDto.role.toLowerCase();

    if (!user) {
      throw new BadRequestException('Workspace member not found');
    }

    // prevent ADMIN from managing OWNER role
    if (
      isAdminActingOnOwner(authUser.role, newRole) ||
      isAdminActingOnOwner(authUser.role, user.role)
    ) {
      throw new ForbiddenException();
    }

    if (user.role === newRole) {
      return user;
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    await this.userRepo.updateUser(
      {
        role: newRole,
      },
      user.id,
      workspaceId,
    );

    await this.spaceMemberRepo.invalidateUserWorkspaceSpaceRoles(
      user.id,
      workspaceId,
    );

  }

  async deactivateUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    if (user.deactivatedAt) {
      throw new BadRequestException('User is already deactivated');
    }

    if (authUser.id === userId) {
      throw new BadRequestException('You cannot deactivate yourself');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException(
        'You cannot deactivate a user with owner role',
      );
    }

    if (user.role === UserRole.OWNER) {
      const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
        UserRole.OWNER,
        workspaceId,
      );

      if (workspaceOwnerCount === 1) {
        throw new BadRequestException(
          'There must be at least one workspace owner',
        );
      }
    }

    const soleActiveTeamAdmin = await this.db
      .selectFrom('teamMembers as membership')
      .innerJoin('teams', 'teams.id', 'membership.teamId')
      .innerJoin('users as memberUser', 'memberUser.id', 'membership.userId')
      .select('membership.teamId')
      .where('teams.workspaceId', '=', workspaceId)
      .where('membership.userId', '=', userId)
      .where('membership.role', '=', TeamRole.ADMIN)
      .where('memberUser.deletedAt', 'is', null)
      .where('memberUser.deactivatedAt', 'is', null)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('teamMembers as other')
              .innerJoin('users as otherUser', 'otherUser.id', 'other.userId')
              .select('other.id')
              .whereRef('other.teamId', '=', 'membership.teamId')
              .where('other.role', '=', TeamRole.ADMIN)
              .where('other.userId', '!=', userId)
              .where('otherUser.deletedAt', 'is', null)
              .where('otherUser.deactivatedAt', 'is', null),
          ),
        ),
      )
      .executeTakeFirst();
    if (soleActiveTeamAdmin) {
      throw new BadRequestException(
        'Assign another active team admin before deactivating this user',
      );
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        { deactivatedAt: new Date() },
        userId,
        workspaceId,
        trx,
      );
      await this.userSessionRepo.revokeByUserId(userId, workspaceId, trx);
    });

    await this.spaceMemberRepo.invalidateUserWorkspaceSpaceRoles(
      userId,
      workspaceId,
    );

  }

  async activateUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    if (!user.deactivatedAt) {
      throw new BadRequestException('User is not deactivated');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException(
        'You cannot activate a user with owner role',
      );
    }

    await this.userRepo.updateUser(
      { deactivatedAt: null },
      userId,
      workspaceId,
    );

    await this.spaceMemberRepo.invalidateUserWorkspaceSpaceRoles(
      userId,
      workspaceId,
    );

  }

  async deleteUser(
    authUser: User,
    userId: string,
    workspaceId: string,
  ): Promise<void> {
    const user = await this.userRepo.findById(userId, workspaceId);

    if (!user || user.deletedAt) {
      throw new BadRequestException('Workspace member not found');
    }

    const workspaceOwnerCount = await this.userRepo.roleCountByWorkspaceId(
      UserRole.OWNER,
      workspaceId,
    );

    if (user.role === UserRole.OWNER && workspaceOwnerCount === 1) {
      throw new BadRequestException(
        'There must be at least one workspace owner',
      );
    }

    if (authUser.id === userId) {
      throw new BadRequestException('You cannot delete yourself');
    }

    if (isAdminActingOnOwner(authUser.role, user.role)) {
      throw new BadRequestException('You cannot delete a user with owner role');
    }

    const soleAdminMembership = await this.db
      .selectFrom('teamMembers as membership')
      .innerJoin('teams', 'teams.id', 'membership.teamId')
      .innerJoin('users as memberUser', 'memberUser.id', 'membership.userId')
      .select('membership.teamId')
      .where('teams.workspaceId', '=', workspaceId)
      .where('membership.userId', '=', userId)
      .where('membership.role', '=', TeamRole.ADMIN)
      .where('memberUser.deletedAt', 'is', null)
      .where('memberUser.deactivatedAt', 'is', null)
      .where(({ not, exists, selectFrom }) =>
        not(
          exists(
            selectFrom('teamMembers as other')
              .innerJoin('users as otherUser', 'otherUser.id', 'other.userId')
              .select('other.id')
              .whereRef('other.teamId', '=', 'membership.teamId')
              .where('other.role', '=', TeamRole.ADMIN)
              .where('other.userId', '!=', userId)
              .where('otherUser.deletedAt', 'is', null)
              .where('otherUser.deactivatedAt', 'is', null),
          ),
        ),
      )
      .executeTakeFirst();
    if (soleAdminMembership) {
      throw new BadRequestException(
        'Assign another team admin before removing this user',
      );
    }

    await executeTx(this.db, async (trx) => {
      await this.userRepo.updateUser(
        {
          name: 'Deleted user',
          email: v4() + '@deleted.tcc-docs.invalid',
          avatarUrl: null,
          settings: null,
          deletedAt: new Date(),
        },
        userId,
        workspaceId,
        trx,
      );

      await trx
        .deleteFrom('spacePermissions')
        .where('userId', '=', userId)
        .execute();
      await trx
        .deleteFrom('pagePermissions')
        .where('userId', '=', userId)
        .where(
          'pageAccessId',
          'in',
          trx
            .selectFrom('pageAccess')
            .select('pageAccess.id')
            .where('pageAccess.workspaceId', '=', workspaceId),
        )
        .execute();
      await trx
        .deleteFrom('teamMembers')
        .where('userId', '=', userId)
        .execute();
      await trx
        .deleteFrom('authAccounts')
        .where('userId', '=', userId)
        .execute();

      await this.watcherRepo.deleteByUserAndWorkspace(userId, workspaceId, {
        trx,
      });

      await this.favoriteRepo.deleteByUserAndWorkspace(userId, workspaceId, {
        trx,
      });

      await this.userSessionRepo.revokeByUserId(userId, workspaceId, trx);
    });

    await this.spaceMemberRepo.invalidateUserWorkspaceSpaceRoles(
      userId,
      workspaceId,
    );


    try {
      await this.attachmentQueue.add(QueueJob.DELETE_USER_AVATARS, user);
    } catch (err) {
      // empty
    }
  }
}
