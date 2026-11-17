import { ForbiddenException, Injectable } from '@nestjs/common';
import { Page, User } from '@tcc-docs/db/types/entity.types';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';

@Injectable()
export class PageAccessService {
  constructor(
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
    private readonly pageRepo: PageRepo,
  ) {}

  async validateCanView(page: Page, user: User): Promise<void> {
    const { allowed } = await this.resolve(page, user);
    if (!allowed) throw new ForbiddenException();
  }

  async validateCanViewWithPermissions(
    page: Page,
    user: User,
  ): Promise<{ canEdit: boolean; hasRestriction: boolean }> {
    const resolved = await this.resolve(page, user);
    if (!resolved.allowed) throw new ForbiddenException();
    return {
      canEdit: resolved.canEdit,
      hasRestriction: resolved.hasRestriction,
    };
  }

  async validateCanEdit(
    page: Page,
    user: User,
  ): Promise<{ hasRestriction: boolean }> {
    const resolved = await this.resolve(page, user);
    if (
      !resolved.allowed ||
      !resolved.canEdit ||
      (await this.isSpaceArchived(page, user))
    ) {
      throw new ForbiddenException();
    }
    return { hasRestriction: resolved.hasRestriction };
  }

  /**
   * Sharing and publication expose page content outside the editor. Keep this
   * capability narrower than ordinary edit access: only the page creator or a
   * Space administrator may administer the public share.
   */
  async validateCanManageShare(page: Page, user: User): Promise<void> {
    if (page.creatorId === user.id) return;

    const ability = await this.getSpaceAbility(user, page.spaceId);
    if (!ability?.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  async validateCanDelete(page: Page, user: User): Promise<void> {
    const resolved = await this.resolve(page, user);
    if (!resolved.allowed || (await this.isSpaceArchived(page, user))) {
      throw new ForbiddenException();
    }
    const withinCreatorWindow =
      page.creatorId === user.id &&
      Date.now() - new Date(page.createdAt).getTime() <= 15 * 60 * 1000;
    if (!withinCreatorWindow && !resolved.canDelete)
      throw new ForbiddenException();
  }

  async validateCanDeleteTree(page: Page, user: User): Promise<void> {
    await this.validateCanDelete(page, user);
    const descendants = await this.pageRepo.getActiveDescendants(page.id);
    for (const descendant of descendants) {
      const descendantPage = await this.pageRepo.findById(descendant.id);
      if (!descendantPage) throw new ForbiddenException();
      const permission = await this.resolve(descendantPage, user);
      if (!permission.allowed || !permission.canDelete)
        throw new ForbiddenException();
    }
  }

  async validateCanRestore(page: Page, user: User): Promise<void> {
    const ability = await this.getSpaceAbility(user, page.spaceId);
    const canManage = Boolean(
      ability?.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings),
    );
    const withinRetention = Boolean(
      page.deletedAt &&
      Date.now() - new Date(page.deletedAt).getTime() <=
        30 * 24 * 60 * 60 * 1000,
    );
    if (!withinRetention || (page.creatorId !== user.id && !canManage)) {
      throw new ForbiddenException();
    }
  }

  async validateCanComment(
    page: Page,
    user: User,
    workspaceId: string,
  ): Promise<void> {
    try {
      await this.validateCanEdit(page, user);
      return;
    } catch {
      // Reader comments are checked below.
    }
    await this.validateCanView(page, user);
    const space = await this.spaceRepo.findById(page.spaceId, workspaceId);
    const settings = space?.settings as Record<string, any> | null;
    if (!settings?.comments?.allowViewerComments)
      throw new ForbiddenException();
  }

  private async resolve(page: Page, user: User) {
    const [rule, ability] = await Promise.all([
      this.pagePermissionRepo.getEffectivePermission(user.id, page.id),
      this.getSpaceAbility(user, page.spaceId),
    ]);
    const isAdmin = Boolean(
      ability?.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings),
    );
    const canViewSpace = Boolean(
      ability?.can(SpaceCaslAction.Read, SpaceCaslSubject.Page),
    );
    if (isAdmin) {
      return {
        allowed: true,
        canEdit: true,
        canDelete: true,
        hasRestriction: rule.hasRestriction,
      };
    }
    if (page.creatorId === user.id && canViewSpace) {
      return {
        allowed: true,
        canEdit: true,
        canDelete: Boolean(
          ability?.can(SpaceCaslAction.Delete, SpaceCaslSubject.Page),
        ),
        hasRestriction: rule.hasRestriction,
      };
    }
    if (rule.blocked) {
      return {
        allowed: false,
        canEdit: false,
        canDelete: false,
        hasRestriction: rule.hasRestriction,
      };
    }
    if (rule.permission) {
      return {
        allowed: rule.permission.canView,
        canEdit: rule.permission.canView && rule.permission.canEdit,
        canDelete: rule.permission.canView && rule.permission.canDelete,
        hasRestriction: rule.hasRestriction,
      };
    }
    const canView = canViewSpace;
    return {
      allowed: canView,
      canEdit:
        canView &&
        Boolean(ability?.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page)),
      canDelete:
        canView &&
        Boolean(ability?.can(SpaceCaslAction.Delete, SpaceCaslSubject.Page)),
      hasRestriction: rule.hasRestriction,
    };
  }

  private async getSpaceAbility(user: User, spaceId: string) {
    try {
      return await this.spaceAbility.createForUser(user, spaceId);
    } catch {
      return undefined;
    }
  }

  private async isSpaceArchived(page: Page, user: User): Promise<boolean> {
    const space = await this.spaceRepo.findById(
      page.spaceId,
      user.workspaceId ?? page.workspaceId,
    );
    return Boolean(space?.archivedAt);
  }
}
