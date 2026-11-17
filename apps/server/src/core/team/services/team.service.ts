import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { TeamRepo } from '@tcc-docs/db/repos/team/team.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { Team, User } from '@tcc-docs/db/types/entity.types';
import { afterTransactionCommit, executeTx } from '@tcc-docs/db/utils';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/notification.constants';
import { CreateTeamDto } from '../dto/create-team.dto';
import { UpdateTeamDto } from '../dto/update-team.dto';
import { AddTeamMembersDto } from '../dto/add-team-members.dto';
import { UpdateTeamMemberRoleDto } from '../dto/update-team-member-role.dto';
import { RemoveTeamMemberDto } from '../dto/remove-team-member.dto';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { SpacePermissionRepo } from '@tcc-docs/db/repos/space/space-permission.repo';

@Injectable()
export class TeamService {
  constructor(
    private readonly teamRepo: TeamRepo,
    private readonly teamMemberRepo: TeamMemberRepo,
    private readonly userRepo: UserRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly spacePermissionRepo: SpacePermissionRepo,
  ) {}

  async listTeams(
    actor: User,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    this.assertWorkspaceMember(actor, workspaceId);
    const memberUserId = this.isWorkspaceAdmin(actor) ? undefined : actor.id;
    const result = await this.teamRepo.getTeamsPaginated(
      workspaceId,
      pagination,
      memberUserId,
    );
    if (this.isWorkspaceAdmin(actor)) {
      result.items = result.items.map((team) => ({ ...team, isAdmin: true, isMember: true }));
    }
    return result;
  }

  async getTeam(actor: User, workspaceId: string, teamId: string) {
    const team = await this.findTeam(teamId, workspaceId);
    this.assertWorkspaceMember(actor, workspaceId);
    const membership = await this.teamMemberRepo.findMembership(actor.id, teamId);
    if (
      !this.isWorkspaceAdmin(actor) &&
      !membership &&
      !(await this.teamRepo.hasSharedPageAccess(teamId, actor.id))
    ) {
      throw new ForbiddenException();
    }

    return {
      ...team,
      isAdmin:
        this.isWorkspaceAdmin(actor) || membership?.role === TeamRole.ADMIN,
      isMember: this.isWorkspaceAdmin(actor) || Boolean(membership),
    };
  }

  async createTeam(
    actor: User,
    workspaceId: string,
    dto: CreateTeamDto,
    existingTrx?: KyselyTransaction,
  ): Promise<Team> {
    this.assertWorkspaceAdmin(actor, workspaceId);
    const existing = await this.teamRepo.findByName(dto.name, workspaceId, {
      trx: existingTrx,
    });
    if (existing) {
      throw new BadRequestException('Team name already exists');
    }

    return executeTx(
      this.db,
      async (trx) => {
        const team = await this.teamRepo.insert(
          {
            workspaceId,
            creatorId: actor.id,
            name: dto.name,
            description: dto.description,
          },
          trx,
        );
        await this.teamMemberRepo.add(
          actor.id,
          team.id,
          workspaceId,
          TeamRole.ADMIN,
          actor.id,
          trx,
        );
        return team;
      },
      existingTrx,
    );
  }

  async updateTeam(actor: User, workspaceId: string, dto: UpdateTeamDto) {
    await this.assertCanManage(actor, workspaceId, dto.teamId);
    const team = await this.findTeam(dto.teamId, workspaceId);

    if (dto.name && dto.name.toLowerCase() !== team.name.toLowerCase()) {
      const sameName = await this.teamRepo.findByName(dto.name, workspaceId);
      if (sameName) {
        throw new BadRequestException('Team name already exists');
      }
    }

    await this.teamRepo.update(
      { name: dto.name, description: dto.description },
      dto.teamId,
      workspaceId,
    );
    const updatedTeam = await this.findTeam(dto.teamId, workspaceId);
    return updatedTeam;
  }

  async listMembers(
    actor: User,
    workspaceId: string,
    teamId: string,
    pagination: PaginationOptions,
  ) {
    await this.assertCanRead(actor, workspaceId, teamId);
    return this.teamMemberRepo.getMembersPaginated(
      teamId,
      workspaceId,
      pagination,
    );
  }

  async addMembers(
    actor: User,
    workspaceId: string,
    dto: AddTeamMembersDto,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.assertCanManage(actor, workspaceId, dto.teamId, trx, true);
      const uniqueUserIds = [...new Set(dto.userIds)];
      if (uniqueUserIds.length !== dto.userIds.length) {
        throw new BadRequestException('Duplicate users are not allowed');
      }

      const teamSpaces = await trx
        .selectFrom('spaces')
        .select(['id', 'archivedAt'])
        .where('teamId', '=', dto.teamId)
        .where('deletedAt', 'is', null)
        .execute();
      const teamSpaceIds = teamSpaces.map(({ id }) => id);
      const teamSpaceIdSet = new Set(teamSpaceIds);

      if (dto.role === TeamRole.ADMIN && dto.permissions?.length) {
        throw new BadRequestException(
          'Team administrators use inherited access and cannot receive explicit permissions',
        );
      }

      if (dto.permissions) {
        const targetUserIds = new Set(uniqueUserIds);
        for (const permission of dto.permissions) {
          if (
            !targetUserIds.has(permission.userId) ||
            !teamSpaceIdSet.has(permission.spaceId)
          ) {
            throw new BadRequestException(
              'Initial permissions must reference the selected team members and Spaces',
            );
          }
        }
      }

      for (const userId of uniqueUserIds) {
        const workspaceUser = await this.userRepo.findById(
          userId,
          workspaceId,
          {
            trx,
          },
        );
        if (
          !workspaceUser ||
          workspaceUser.deletedAt ||
          workspaceUser.deactivatedAt
        ) {
          throw new BadRequestException('User must belong to the workspace');
        }
        const membership = await this.teamMemberRepo.findMembership(
          userId,
          dto.teamId,
          trx,
        );
        if (membership) {
          throw new BadRequestException('User is already a team member');
        }

        if (teamSpaceIds.length > 0) {
          await trx
            .deleteFrom('spacePermissions')
            .where('userId', '=', userId)
            .where('spaceId', 'in', teamSpaceIds)
            .execute();
        }

        await this.teamMemberRepo.add(
          userId,
          dto.teamId,
          workspaceId,
          dto.role ?? TeamRole.MEMBER,
          actor.id,
          trx,
        );

        if ((dto.role ?? TeamRole.MEMBER) === TeamRole.MEMBER) {
          const permissions = this.getPermissionsForUser(
            dto,
            userId,
            dto.permissions === undefined
              ? teamSpaces.filter(({ archivedAt }) => !archivedAt)
              : undefined,
          );

          const permissionsBySpace = new Map<string, typeof permissions>();
          for (const permission of permissions) {
            const current = permissionsBySpace.get(permission.spaceId) ?? [];
            current.push(permission);
            permissionsBySpace.set(permission.spaceId, current);
          }

          for (const [spaceId, spacePermissions] of permissionsBySpace) {
            await this.spacePermissionRepo.upsertBatch(
              spaceId,
              spacePermissions.map(
                ({ userId: permissionUserId, spaceId: _spaceId, ...rest }) => ({
                  userId: permissionUserId,
                  ...rest,
                }),
              ),
              actor.id,
              trx,
            );
          }
        }
      }

      afterTransactionCommit(trx, async () => {
        await this.spaceMemberRepo.invalidateUserSpaceRoles(
          uniqueUserIds,
          teamSpaceIds,
        );
        for (const userId of uniqueUserIds) {
          await this.createInternalNotification(
            userId,
            workspaceId,
            NotificationType.TEAM_MEMBER_ADDED,
            actor.id,
            { teamId: dto.teamId, role: dto.role ?? TeamRole.MEMBER },
          );
        }
      });
    });
  }

  private getPermissionsForUser(
    dto: AddTeamMembersDto,
    userId: string,
    defaultSpaces?: Array<{ id: string }>,
  ) {
    const permissions =
      dto.permissions ??
      (defaultSpaces ?? []).map(({ id: spaceId }) => ({
        userId,
        spaceId,
        canView: true,
        canCreate: true,
        canEdit: false,
        canDelete: false,
      }));

    const userPermissions = permissions.filter(
      (permission) => permission.userId === userId,
    );
    const uniqueSpaceIds = new Set(
      userPermissions.map((permission) => permission.spaceId),
    );
    if (uniqueSpaceIds.size !== userPermissions.length) {
      throw new BadRequestException(
        'A user can only have one permission entry per space',
      );
    }

    for (const permission of userPermissions) {
      if (
        !permission.canView &&
        (permission.canCreate || permission.canEdit || permission.canDelete)
      ) {
        throw new BadRequestException('View permission is required');
      }
    }

    return userPermissions;
  }

  async updateMemberRole(
    actor: User,
    workspaceId: string,
    dto: UpdateTeamMemberRoleDto,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.assertCanManage(actor, workspaceId, dto.teamId, trx, true);
      const membership = await this.teamMemberRepo.findMembership(
        dto.userId,
        dto.teamId,
        trx,
      );
      if (!membership) {
        throw new NotFoundException('Team member not found');
      }
      if (
        membership.role === TeamRole.ADMIN &&
        dto.role !== TeamRole.ADMIN &&
        (await this.teamMemberRepo.countAdmins(dto.teamId, trx)) <= 1
      ) {
          throw new BadRequestException('A team must have at least one admin');
      }
      const teamSpaceIds = await trx
        .selectFrom('spaces')
        .select('id')
        .where('teamId', '=', dto.teamId)
        .execute();
      if (dto.role === TeamRole.ADMIN) {
        await trx
          .deleteFrom('spacePermissions')
          .where('userId', '=', dto.userId)
          .where('spaceId', 'in', teamSpaceIds.map(({ id }) => id))
          .execute();
      }
      await this.teamMemberRepo.updateRole(
        dto.userId,
        dto.teamId,
        dto.role,
        trx,
      );
      if (dto.role === TeamRole.MEMBER) {
        await this.spacePermissionRepo.grantDefaultAccessForTeamMember(
          dto.teamId,
          dto.userId,
          actor.id,
          trx,
        );
      }
      afterTransactionCommit(trx, async () => {
        await this.spaceMemberRepo.invalidateUserSpaceRoles(
          [dto.userId],
          teamSpaceIds.map(({ id }) => id),
        );
        await this.createInternalNotification(
          dto.userId,
          workspaceId,
          NotificationType.TEAM_MEMBER_ROLE_CHANGED,
          actor.id,
          { teamId: dto.teamId, role: dto.role },
        );
      });
    });
  }

  async removeMember(
    actor: User,
    workspaceId: string,
    dto: RemoveTeamMemberDto,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      await this.assertCanManage(actor, workspaceId, dto.teamId, trx, true);
      const membership = await this.teamMemberRepo.findMembership(
        dto.userId,
        dto.teamId,
        trx,
      );
      if (!membership) {
        throw new NotFoundException('Team member not found');
      }
      if (
        membership.role === TeamRole.ADMIN &&
        (await this.teamMemberRepo.countAdmins(dto.teamId, trx)) <= 1
      ) {
        throw new BadRequestException('A team must have at least one admin');
      }
      await this.teamMemberRepo.remove(dto.userId, dto.teamId, trx);
      const teamSpaceIds = trx
        .selectFrom('spaces')
        .select('id')
        .where('teamId', '=', dto.teamId);
      const teamPageIds = trx
        .selectFrom('pages')
        .select('pages.id')
        .where('pages.spaceId', 'in', teamSpaceIds);
      const teamPageAccessIds = trx
        .selectFrom('pageAccess')
        .select('pageAccess.id')
        .where('pageAccess.pageId', 'in', teamPageIds);

      await trx
        .deleteFrom('spacePermissions')
        .where('userId', '=', dto.userId)
        .where('spaceId', 'in', teamSpaceIds)
        .execute();
      await trx
        .deleteFrom('pagePermissions')
        .where('userId', '=', dto.userId)
        .where('pageAccessId', 'in', teamPageAccessIds)
        .execute();
      await trx
        .deleteFrom('favorites')
        .where('userId', '=', dto.userId)
        .where((eb) =>
          eb.or([
            eb('spaceId', 'in', teamSpaceIds),
            eb('pageId', 'in', teamPageIds),
          ]),
        )
        .execute();
      await trx
        .deleteFrom('watchers')
        .where('userId', '=', dto.userId)
        .where((eb) =>
          eb.or([
            eb('spaceId', 'in', teamSpaceIds),
            eb('pageId', 'in', teamPageIds),
          ]),
        )
        .execute();
      const removedSpaceIds = await teamSpaceIds.execute();
      afterTransactionCommit(trx, async () => {
        await this.spaceMemberRepo.invalidateUserSpaceRoles(
          [dto.userId],
          removedSpaceIds.map(({ id }) => id),
        );
        await this.createInternalNotification(
          dto.userId,
          workspaceId,
          NotificationType.TEAM_MEMBER_REMOVED,
          actor.id,
          { teamId: dto.teamId },
        );
      });
    });
  }

  async requireTeamAdmin(
    actor: User,
    workspaceId: string,
    teamId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ): Promise<void> {
    await this.assertCanManage(actor, workspaceId, teamId, trx, forUpdate);
  }

  private async findTeam(
    teamId: string,
    workspaceId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ) {
    const team = await this.teamRepo.findById(teamId, workspaceId, {
      trx,
      forUpdate,
    });
    if (!team) throw new NotFoundException('Team not found');
    return team;
  }

  private async assertCanRead(
    actor: User,
    workspaceId: string,
    teamId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ) {
    this.assertWorkspaceMember(actor, workspaceId);
    await this.findTeam(teamId, workspaceId, trx, forUpdate);
    if (this.isWorkspaceAdmin(actor)) return undefined;

    const membership = await this.teamMemberRepo.findMembership(
      actor.id,
      teamId,
      trx,
    );
    if (!membership) throw new ForbiddenException();
    return membership;
  }

  private async assertCanManage(
    actor: User,
    workspaceId: string,
    teamId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ) {
    const membership = await this.assertCanRead(
      actor,
      workspaceId,
      teamId,
      trx,
      forUpdate,
    );
    if (this.isWorkspaceAdmin(actor)) return;
    if (membership?.role !== TeamRole.ADMIN) throw new ForbiddenException();
  }

  private assertWorkspaceAdmin(actor: User, workspaceId: string) {
    this.assertWorkspaceMember(actor, workspaceId);
    if (!this.isWorkspaceAdmin(actor)) throw new ForbiddenException();
  }

  private assertWorkspaceMember(actor: User, workspaceId: string) {
    if (actor.workspaceId !== workspaceId) throw new ForbiddenException();
  }

  private isWorkspaceAdmin(actor: User) {
    return actor.role === UserRole.OWNER || actor.role === UserRole.ADMIN;
  }

  private async createInternalNotification(
    userId: string,
    workspaceId: string,
    type: NotificationType,
    actorId: string,
    data: Record<string, string>,
  ) {
    if (userId === actorId) return;
    await this.notificationService.create({
      userId,
      workspaceId,
      type,
      actorId,
      data,
    });
  }
}
