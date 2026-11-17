import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { Page, User } from '@tcc-docs/db/types/entity.types';
import { emptyCursorPaginationResult } from '@tcc-docs/db/pagination/cursor-pagination';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { executeTx } from '@tcc-docs/db/utils';
import { PageAccessLevel, PagePermissionSubjectType } from '../../../common/helpers/types/permission';
import SpaceAbilityFactory from '../../casl/abilities/space-ability.factory';
import { SpaceCaslAction, SpaceCaslSubject } from '../../casl/interfaces/space-ability.type';
import { PageAccessService } from '../page-access/page-access.service';
import {
  AddPagePermissionDto,
  PagePermissionRuleDto,
  RemovePagePermissionDto,
  UpdatePagePermissionDto,
} from '../dto/page-permission.dto';

@Injectable()
export class PagePermissionService {
  constructor(
    private readonly pageRepo: PageRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly pageAccessService: PageAccessService,
    private readonly spaceAbility: SpaceAbilityFactory,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async getRestrictionInfo(pageId: string, actor: User) {
    const page = await this.getPage(pageId, actor);
    await this.pageAccessService.validateCanView(page, actor);
    const [directAccess, inheritedAccess] = await Promise.all([
      this.pagePermissionRepo.findPageAccessByPageId(page.id),
      this.pagePermissionRepo.findRestrictedAncestor(page.id, { excludeSelf: true }),
    ]);
    return {
      restrictionId: directAccess?.id,
      hasDirectRestriction: directAccess?.accessMode === 'restricted',
      hasInheritedRestriction: Boolean(inheritedAccess),
      inheritedFrom: undefined,
      userAccess: {
        canView: true,
        canEdit: true,
        canManage: await this.canManagePage(page, actor),
      },
    };
  }

  async listPermissions(pageId: string, actor: User, pagination: PaginationOptions) {
    const page = await this.getPage(pageId, actor);
    await this.pageAccessService.validateCanView(page, actor);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (!access) return emptyCursorPaginationResult(pagination.limit);
    return this.pagePermissionRepo.getPagePermissionsPaginated(access.id, pagination);
  }

  async listRecipients(pageId: string, actor: User, pagination: PaginationOptions) {
    const page = await this.getPage(pageId, actor);
    await this.requirePageManager(page, actor);
    const query = pagination.query?.trim() ?? '';
    const users = await this.db
      .selectFrom('users')
      .select(['id', 'name', 'email', 'avatarUrl'])
      .where('workspaceId', '=', page.workspaceId)
      .where('deletedAt', 'is', null)
      .where('deactivatedAt', 'is', null)
      .$if(Boolean(query), (qb) => qb.where((eb) => eb('name', 'ilike', `%${query}%`).or('email', 'ilike', `%${query}%`)))
      .orderBy('name')
      .limit(Math.min(pagination.limit ?? 50, 100))
      .execute();
    const teams = await this.db
      .selectFrom('teams')
      .select(['id', 'name'])
      .where('workspaceId', '=', page.workspaceId)
      .$if(Boolean(query), (qb) => qb.where('name', 'ilike', `%${query}%`))
      .orderBy('name')
      .limit(Math.min(pagination.limit ?? 50, 100))
      .execute();
    return {
      items: [
        { id: page.workspaceId, name: 'Workspace', type: PagePermissionSubjectType.WORKSPACE },
        ...users.map((user) => ({ ...user, type: PagePermissionSubjectType.USER })),
        ...teams.map((team) => ({ ...team, type: PagePermissionSubjectType.TEAM })),
      ],
    };
  }

  async restrictPage(pageId: string, actor: User): Promise<void> {
    const page = await this.getPage(pageId, actor);
    await this.requirePageManager(page, actor);
    await executeTx(this.db, async (trx) => {
      const existing = await this.pagePermissionRepo.findPageAccessByPageId(page.id, trx);
      if (existing) {
        await trx.updateTable('pageAccess').set({ accessMode: 'restricted', updatedAt: new Date() }).where('id', '=', existing.id).execute();
        return;
      }
      const access = await this.pagePermissionRepo.insertPageAccess({
        pageId: page.id,
        workspaceId: page.workspaceId,
        spaceId: page.spaceId,
        accessLevel: PageAccessLevel.RESTRICTED,
        accessMode: 'restricted',
        creatorId: actor.id,
      }, trx);
      await this.pagePermissionRepo.insertPagePermissions([{
        pageAccessId: access.id,
        userId: page.creatorId ?? actor.id,
        role: 'writer',
        canView: true,
        canEdit: true,
        canDelete: true,
        includeSubpages: true,
        addedById: actor.id,
      }], trx);
    });
  }

  async unrestrictPage(pageId: string, actor: User): Promise<void> {
    const page = await this.getPage(pageId, actor);
    await this.requirePageManager(page, actor);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (!access) return;
    await this.db.updateTable('pageAccess').set({ accessMode: 'shared', updatedAt: new Date() }).where('id', '=', access.id).execute();
  }

  async addPermission(dto: AddPagePermissionDto, actor: User): Promise<void> {
    const page = await this.getPage(dto.pageId, actor);
    await this.requirePageManager(page, actor);
    const rules = this.normalizeRules(dto.rules);
    await executeTx(this.db, async (trx) => {
      const access = await this.getOrCreateSharedAccess(page, actor, trx);
      for (const rule of rules) {
        await this.assertRuleTarget(rule, page.workspaceId, trx);
        let deleteQuery = trx.deleteFrom('pagePermissions').where('pageAccessId', '=', access.id);
        if (rule.subjectType === PagePermissionSubjectType.USER) {
          deleteQuery = deleteQuery.where('userId', '=', rule.subjectId!);
        } else if (rule.subjectType === PagePermissionSubjectType.TEAM) {
          deleteQuery = deleteQuery.where('teamId', '=', rule.subjectId!);
        } else {
          deleteQuery = deleteQuery.where('workspaceWide', '=', true);
        }
        await deleteQuery.execute();
        await this.pagePermissionRepo.insertPagePermissions([{
          pageAccessId: access.id,
          userId: rule.subjectType === PagePermissionSubjectType.USER ? rule.subjectId! : null,
          teamId: rule.subjectType === PagePermissionSubjectType.TEAM ? rule.subjectId! : null,
          workspaceWide: rule.subjectType === PagePermissionSubjectType.WORKSPACE,
          role: rule.canEdit ? 'writer' : 'reader',
          canView: rule.canView,
          canEdit: rule.canEdit,
          canDelete: rule.canDelete,
          includeSubpages: rule.includeSubpages,
          addedById: actor.id,
        }], trx);
      }
    });
  }

  async removePermission(dto: RemovePagePermissionDto, actor: User): Promise<void> {
    const page = await this.getPage(dto.pageId, actor);
    await this.requirePageManager(page, actor);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (!access) return;
    await this.pagePermissionRepo.deletePagePermissionsByIds(access.id, [...new Set(dto.permissionIds)]);
  }

  async updatePermissionRole(dto: UpdatePagePermissionDto, actor: User): Promise<void> {
    const page = await this.getPage(dto.pageId, actor);
    await this.requirePageManager(page, actor);
    const access = await this.pagePermissionRepo.findPageAccessByPageId(page.id);
    if (!access) throw new NotFoundException('Page access not found');
    const current = await this.pagePermissionRepo.findPagePermissionById(access.id, dto.permissionId);
    if (!current) throw new NotFoundException('Page permission not found');
    const flags = this.normalizeFlags({
      canView: dto.canView ?? current.canView,
      canEdit: dto.canEdit ?? current.canEdit,
      canDelete: dto.canDelete ?? current.canDelete,
    });
    await this.pagePermissionRepo.updatePagePermission(access.id, dto.permissionId, {
      ...flags,
      includeSubpages: dto.includeSubpages ?? current.includeSubpages,
    });
  }

  private async getOrCreateSharedAccess(page: Page, actor: User, trx: KyselyTransaction) {
    const existing = await this.pagePermissionRepo.findPageAccessByPageId(page.id, trx);
    if (existing) return existing;
    return this.pagePermissionRepo.insertPageAccess({
      pageId: page.id,
      workspaceId: page.workspaceId,
      spaceId: page.spaceId,
      accessLevel: PageAccessLevel.RESTRICTED,
      accessMode: 'shared',
      creatorId: actor.id,
    }, trx);
  }

  private normalizeRules(rules: PagePermissionRuleDto[]) {
    if (!rules.length || rules.length > 100) throw new BadRequestException('At least one access rule is required');
    const unique = new Set<string>();
    return rules.map((rule) => {
      const key = `${rule.subjectType}:${rule.subjectId ?? 'workspace'}`;
      if (unique.has(key)) throw new BadRequestException('Duplicate access targets are not allowed');
      unique.add(key);
      return { ...rule, ...this.normalizeFlags(rule) };
    });
  }

  private normalizeFlags(flags: { canView: boolean; canEdit: boolean; canDelete: boolean }) {
    const canView = flags.canView || flags.canEdit || flags.canDelete;
    return { canView, canEdit: flags.canEdit, canDelete: flags.canDelete };
  }

  private async assertRuleTarget(rule: PagePermissionRuleDto, workspaceId: string, trx: KyselyTransaction) {
    if (rule.subjectType === PagePermissionSubjectType.WORKSPACE) return;
    if (rule.subjectType === PagePermissionSubjectType.USER) {
      const user = await trx.selectFrom('users').select('id').where('id', '=', rule.subjectId!).where('workspaceId', '=', workspaceId).where('deletedAt', 'is', null).where('deactivatedAt', 'is', null).executeTakeFirst();
      if (!user) throw new BadRequestException('User must be an active workspace member');
      return;
    }
    const team = await trx.selectFrom('teams').select('id').where('id', '=', rule.subjectId!).where('workspaceId', '=', workspaceId).executeTakeFirst();
    if (!team) throw new BadRequestException('Team must belong to the workspace');
  }

  private async requirePageManager(page: Page, actor: User) {
    if (await this.canManagePage(page, actor)) return;
    throw new ForbiddenException();
  }

  private async canManagePage(page: Page, actor: User): Promise<boolean> {
    if (page.creatorId === actor.id) return true;
    try {
      const ability = await this.spaceAbility.createForUser(actor, page.spaceId);
      return ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings);
    } catch {
      return false;
    }
  }

  private async getPage(pageId: string, actor: User): Promise<Page> {
    if (!actor.workspaceId) throw new NotFoundException('Page not found');
    const page = await this.pageRepo.findById(pageId);
    if (!page || page.workspaceId !== actor.workspaceId || page.deletedAt) throw new NotFoundException('Page not found');
    return page;
  }
}
