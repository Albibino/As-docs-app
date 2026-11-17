import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { SpacePermissionRepo } from '@tcc-docs/db/repos/space/space-permission.repo';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { User } from '@tcc-docs/db/types/entity.types';
import { Space } from '@tcc-docs/db/types/entity.types';
import { KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { afterTransactionCommit, executeTx } from '@tcc-docs/db/utils';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { UpdateSpacePermissionsDto } from '../dto/update-space-permissions.dto';
import { UpdateSpaceMemberPermissionDto } from '../dto/update-space-member-permission.dto';
import { SpacePermissionEntryDto } from '../dto/space-permission-entry.dto';
import { TeamService } from '../../team/services/team.service';
import { NotificationService } from '../../notification/notification.service';
import { NotificationType } from '../../notification/notification.constants';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';

type PermissionSnapshot = SpacePermissionEntryDto;

type PermissionChange = {
  before: PermissionSnapshot;
  after: PermissionSnapshot;
};

@Injectable()
export class SpacePermissionService {
  constructor(
    private readonly teamService: TeamService,
    private readonly spaceRepo: SpaceRepo,
    private readonly teamMemberRepo: TeamMemberRepo,
    private readonly permissionRepo: SpacePermissionRepo,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly notificationService: NotificationService,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async listPermissions(
    actor: User,
    workspaceId: string,
    spaceId: string,
    pagination: PaginationOptions,
  ) {
    await this.requireAclAdmin(actor, workspaceId, spaceId);
    return this.permissionRepo.getPermissionMatrix(
      spaceId,
      workspaceId,
      pagination,
    );
  }

  async listAccessibleMembers(
    actor: User,
    workspaceId: string,
    spaceId: string,
    pagination: PaginationOptions,
  ) {
    if (actor.workspaceId !== workspaceId) throw new NotFoundException();
    const space = await this.spaceRepo.findById(spaceId, workspaceId);
    if (!space) throw new NotFoundException('Space not found');

    if (!this.isWorkspaceAdmin(actor)) {
      const membership = await this.teamMemberRepo.findMembership(
        actor.id,
        space.teamId,
      );
      if (!membership) throw new ForbiddenException();
    }

    return this.permissionRepo.getAccessibleMembers(
      spaceId,
      workspaceId,
      pagination,
    );
  }

  async updatePermissions(
    actor: User,
    workspaceId: string,
    dto: UpdateSpacePermissionsDto,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      const space = await this.requireAclAdmin(
        actor,
        workspaceId,
        dto.spaceId,
        trx,
        true,
      );
      const changes = await this.validateAndUpsert(
        actor,
        space,
        dto.permissions,
        trx,
      );
      for (const change of changes) {
        if (change.before.canView && !change.after.canView) {
          await this.revokeSpaceAncillaryAccess(
            change.after.userId,
            space.id,
            trx,
          );
        }
      }
      afterTransactionCommit(trx, async () => {
        await Promise.all([
          this.publishPermissionChanges(actor, workspaceId, space.id, changes),
          this.spaceMemberRepo.invalidateUserSpaceRoles(
            changes.map((change) => change.after.userId),
            [space.id],
          ),
        ]);
      });
    });
  }

  async updateMemberPermission(
    actor: User,
    workspaceId: string,
    dto: UpdateSpaceMemberPermissionDto,
  ): Promise<void> {
    await executeTx(this.db, async (trx) => {
      const space = await this.requireAclAdmin(
        actor,
        workspaceId,
        dto.spaceId,
        trx,
        true,
      );
      const changes = await this.upsertSinglePermission(actor, space, dto, trx);
      if (changes[0]?.before.canView && !changes[0]?.after.canView) {
        await this.revokeSpaceAncillaryAccess(dto.userId, space.id, trx);
      }
      afterTransactionCommit(trx, async () => {
        await Promise.all([
          this.publishPermissionChanges(actor, workspaceId, space.id, changes),
          this.spaceMemberRepo.invalidateUserSpaceRoles([dto.userId], [space.id]),
        ]);
      });
    });
  }

  async setInitialPermissions(
    actor: User,
    space: Space,
    permissions: SpacePermissionEntryDto[],
    trx: KyselyTransaction,
  ): Promise<void> {
    await this.validateAndUpsert(actor, space, permissions, trx);
  }

  private async validateAndUpsert(
    actor: User,
    space: Space,
    permissions: SpacePermissionEntryDto[],
    trx: KyselyTransaction,
  ): Promise<PermissionChange[]> {
    const uniqueIds = new Set(permissions.map(({ userId }) => userId));
    if (uniqueIds.size !== permissions.length) {
      throw new BadRequestException('Duplicate users are not allowed');
    }

    for (const permission of permissions) {
      if (
        !permission.canView &&
        (permission.canCreate || permission.canEdit || permission.canDelete)
      ) {
        throw new BadRequestException('View permission is required');
      }
      const membership = await this.teamMemberRepo.findMembership(
        permission.userId,
        space.teamId,
        trx,
      );
      if (!membership || membership.role === TeamRole.ADMIN) {
        throw new BadRequestException(
          'Explicit permissions require a regular team member',
        );
      }
    }

    const existingPermissions = await this.permissionRepo.findForSpace(
      space.id,
      trx,
    );
    const existingByUserId = new Map(
      existingPermissions.map((permission) => [permission.userId, permission]),
    );
    const permissionsByUserId = new Map(
      permissions.map((permission) => [permission.userId, permission]),
    );

    await this.permissionRepo.deleteExceptUsers(
      space.id,
      permissions.map(({ userId }) => userId),
      trx,
    );
    await this.permissionRepo.upsertBatch(space.id, permissions, actor.id, trx);

    const changes = existingPermissions.map((permission) => {
      const after = permissionsByUserId.get(permission.userId);
      return {
        before: this.toPermissionSnapshot(permission.userId, permission),
        after: after ?? this.toPermissionSnapshot(permission.userId),
      };
    });

    for (const permission of permissions) {
      if (!existingByUserId.has(permission.userId)) {
        changes.push({
          before: this.toPermissionSnapshot(permission.userId),
          after: permission,
        });
      } else {
        const change = changes.find(
          ({ before }) => before.userId === permission.userId,
        );
        if (change) change.after = permission;
      }
    }

    return changes.filter(
      ({ before, after }) => !this.permissionsEqual(before, after),
    );
  }

  private async upsertSinglePermission(
    actor: User,
    space: Space,
    permission: SpacePermissionEntryDto,
    trx: KyselyTransaction,
  ): Promise<PermissionChange[]> {
    if (
      !permission.canView &&
      (permission.canCreate || permission.canEdit || permission.canDelete)
    ) {
      throw new BadRequestException('View permission is required');
    }
    const membership = await this.teamMemberRepo.findMembership(
      permission.userId,
      space.teamId,
      trx,
    );
    if (!membership || membership.role === TeamRole.ADMIN) {
      throw new BadRequestException(
        'Explicit permissions require a regular team member',
      );
    }
    const existing = await this.permissionRepo.findForUsers(
      space.id,
      [permission.userId],
      trx,
    );
    const before = this.toPermissionSnapshot(permission.userId, existing[0]);
    const { spaceId: _spaceId, ...entry } = permission as SpacePermissionEntryDto & {
      spaceId?: string;
    };
    await this.permissionRepo.upsertBatch(space.id, [entry], actor.id, trx);
    const after = this.toPermissionSnapshot(permission.userId, entry);
    return this.permissionsEqual(before, after) ? [] : [{ before, after }];
  }

  private async requireAclAdmin(
    actor: User,
    workspaceId: string,
    spaceId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ) {
    if (actor.workspaceId !== workspaceId) throw new NotFoundException();
    const space = await this.spaceRepo.findById(spaceId, workspaceId, { trx });
    if (!space) throw new NotFoundException('Space not found');
    try {
      await this.teamService.requireTeamAdmin(
        actor,
        workspaceId,
        space.teamId,
        trx,
        forUpdate,
      );
    } catch (error) {
      if (error instanceof NotFoundException) throw error;
      throw new ForbiddenException();
    }
    return space;
  }

  private isWorkspaceAdmin(actor: User): boolean {
    return actor.role === UserRole.OWNER || actor.role === UserRole.ADMIN;
  }

  private toPermissionSnapshot(
    userId: string,
    permission?: {
      canView: boolean;
      canCreate: boolean;
      canEdit: boolean;
      canDelete: boolean;
    },
  ): PermissionSnapshot {
    return {
      userId,
      canView: permission?.canView ?? false,
      canCreate: permission?.canCreate ?? false,
      canEdit: permission?.canEdit ?? false,
      canDelete: permission?.canDelete ?? false,
    };
  }

  private permissionsEqual(
    before: PermissionSnapshot,
    after: PermissionSnapshot,
  ) {
    return (
      before.canView === after.canView &&
      before.canCreate === after.canCreate &&
      before.canEdit === after.canEdit &&
      before.canDelete === after.canDelete
    );
  }

  private async publishPermissionChanges(
    actor: User,
    workspaceId: string,
    spaceId: string,
    changes: PermissionChange[],
  ) {
    for (const change of changes) {

      if (change.after.userId === actor.id) continue;
      const type =
        !change.before.canView && change.after.canView
          ? NotificationType.SPACE_ACCESS_GRANTED
          : change.before.canView && !change.after.canView
            ? NotificationType.SPACE_ACCESS_REVOKED
            : NotificationType.SPACE_ACCESS_CHANGED;
      await this.notificationService.create({
        userId: change.after.userId,
        workspaceId,
        type,
        actorId: actor.id,
        data: {
          spaceId,
          canView: change.after.canView,
          canCreate: change.after.canCreate,
          canEdit: change.after.canEdit,
          canDelete: change.after.canDelete,
        },
      });
    }
  }

  private async revokeSpaceAncillaryAccess(
    userId: string,
    spaceId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    const pageIds = trx
      .selectFrom('pages')
      .select('id')
      .where('spaceId', '=', spaceId);

    await trx
      .deleteFrom('favorites')
      .where('userId', '=', userId)
      .where((eb) =>
        eb.or([
          eb('spaceId', '=', spaceId),
          eb('pageId', 'in', pageIds),
        ]),
      )
      .execute();

    await trx
      .deleteFrom('watchers')
      .where('userId', '=', userId)
      .where((eb) =>
        eb.or([
          eb('spaceId', '=', spaceId),
          eb('pageId', 'in', pageIds),
        ]),
      )
      .execute();
  }
}
