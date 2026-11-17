import { Injectable, NotFoundException } from '@nestjs/common';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { SpacePermissionRepo } from '@tcc-docs/db/repos/space/space-permission.repo';
import { User } from '@tcc-docs/db/types/entity.types';
import {
  SpacePermission,
  TeamRole,
} from '../../../common/helpers/types/permission';
import { isWorkspaceAdmin } from '../../../common/helpers';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';

@Injectable()
export class SpaceAuthorizationService {
  constructor(
    private readonly spaceRepo: SpaceRepo,
    private readonly teamMemberRepo: TeamMemberRepo,
    private readonly spacePermissionRepo: SpacePermissionRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  async resolve(user: User, spaceId: string): Promise<SpacePermission | null> {
    if (!user.workspaceId || user.deletedAt || user.deactivatedAt) return null;
    const space = await this.spaceRepo.findById(spaceId, user.workspaceId);
    if (!space || space.deletedAt) return null;

    if (isWorkspaceAdmin(user.role)) {
      return this.fullAccess(
        user.id,
        'workspace-admin',
        Boolean(space.archivedAt),
      );
    }

    const membership = await this.teamMemberRepo.findMembership(
      user.id,
      space.teamId,
    );
    if (!membership) {
      if (
        space.archivedAt ||
        !(await this.pagePermissionRepo.hasSharedPermissionForSpace(user.id, space.id))
      ) {
        return null;
      }
      return {
        userId: user.id,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
        source: 'page-share',
      };
    }
    if (membership.role === TeamRole.ADMIN) {
      return this.fullAccess(
        user.id,
        'team-admin',
        Boolean(space.archivedAt),
      );
    }
    if (space.archivedAt) return null;

    const permission = await this.spacePermissionRepo.findForUser(
      space.id,
      user.id,
    );
    if (!permission?.canView) return null;

    return {
      userId: user.id,
      canView: permission.canView,
      canCreate: permission.canCreate,
      canEdit: permission.canEdit,
      canDelete: permission.canDelete,
      source: 'explicit',
    };
  }

  async requireView(user: User, spaceId: string): Promise<SpacePermission> {
    const permission = await this.resolve(user, spaceId);
    if (!permission?.canView) throw new NotFoundException('Space not found');
    return permission;
  }

  private fullAccess(
    userId: string,
    source: 'workspace-admin' | 'team-admin',
    archived = false,
  ): SpacePermission {
    return {
      userId,
      canView: true,
      canCreate: !archived,
      canEdit: !archived,
      canDelete: !archived,
      source,
    };
  }
}
