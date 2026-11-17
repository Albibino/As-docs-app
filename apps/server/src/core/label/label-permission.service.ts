import { ForbiddenException, Injectable } from '@nestjs/common';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { LabelOwnerScope } from '@tcc-docs/db/repos/label/label-scope';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../casl/interfaces/workspace-ability.type';

/**
 * Who may curate labels. Taxonomy is governed at the scope that owns it: a
 * workspace admin for workspace-wide labels, a space admin for a space's own.
 * Applying labels to a page is a different question entirely and is settled by
 * page permissions.
 */
@Injectable()
export class LabelPermissionService {
  constructor(
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly spaceRepo: SpaceRepo,
  ) {}

  /** The scope a create request targets, once the caller is cleared for it. */
  async resolveManageableOwner(
    user: User,
    workspace: Workspace,
    spaceId?: string | null,
  ): Promise<LabelOwnerScope> {
    const owner: LabelOwnerScope = {
      workspaceId: workspace.id,
      spaceId: spaceId ?? null,
    };
    await this.assertCanManage(user, workspace, owner);
    return owner;
  }

  async assertCanManage(
    user: User,
    workspace: Workspace,
    owner: LabelOwnerScope,
  ): Promise<void> {
    // Guards against a label id from another tenant reaching a handler.
    if (owner.workspaceId !== workspace.id) {
      throw new ForbiddenException();
    }

    if (owner.spaceId) {
      const space = await this.spaceRepo.findById(owner.spaceId, workspace.id);
      if (!space) {
        throw new ForbiddenException();
      }
      const ability = await this.spaceAbility.createForUser(
        user,
        owner.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Label)) {
        throw new ForbiddenException();
      }
      return;
    }

    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Label)
    ) {
      throw new ForbiddenException();
    }
  }

  async assertCanReadSpace(
    user: User,
    workspace: Workspace,
    spaceId: string,
  ): Promise<void> {
    const space = await this.spaceRepo.findById(spaceId, workspace.id);
    if (!space) {
      throw new ForbiddenException();
    }
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }
}
