import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PageService } from './services/page.service';
import { BacklinkService } from './services/backlink.service';
import { PageAccessService } from './page-access/page-access.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { MovePageDto, MovePageToSpaceDto } from './dto/move-page.dto';
import {
  DeletePageDto,
  PageHistoryIdDto,
  PageIdDto,
  PageInfoDto,
  RestorePageHistoryDto,
  SaveManualPageHistoryDto,
} from './dto/page.dto';
import { PageHistoryService } from './services/page-history.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { Page, User, Workspace } from '@tcc-docs/db/types/entity.types';
import { SidebarPageDto } from './dto/sidebar-page.dto';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { RecentPageDto } from './dto/recent-page.dto';
import { CreatedByUserDto } from './dto/created-by-user.dto';
import { DuplicatePageDto } from './dto/duplicate-page.dto';
import { DeletedPageDto } from './dto/deleted-page.dto';
import { BacklinksListDto } from './dto/backlink.dto';
import { LabelService } from '../label/label.service';
import {
  CreatePageLabelDto,
  PageLabelDto,
  PageTaxonomySelectionDto,
  PageTaxonomyNodeDto,
  PageTaxonomyTreeDto,
} from '../label/dto/label.dto';
import {
  jsonToHtml,
  jsonToMarkdown,
} from '../../collaboration/collaboration.util';
import { PagesByIdsDto } from './dto/page-list.dto';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PageController {
  constructor(
    private readonly pageService: PageService,
    private readonly pageRepo: PageRepo,
    private readonly pageHistoryService: PageHistoryService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
    private readonly backlinkService: BacklinkService,
    private readonly labelService: LabelService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getPage(@Body() dto: PageInfoDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeSpace: true,
      includeContent: true,
      includeCreator: true,
      includeLastUpdatedBy: true,
      includeContributors: true,
      includeDeletedBy: true,
    });

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const { canEdit, hasRestriction } =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);

    const permissions = { canEdit, hasRestriction };

    if (dto.format && dto.format !== 'json' && page.content) {
      const contentOutput =
        dto.format === 'markdown'
          ? jsonToMarkdown(page.content)
          : jsonToHtml(page.content);
      return {
        ...page,
        content: contentOutput,
        permissions,
      };
    }

    return { ...page, permissions };
  }

  @HttpCode(HttpStatus.OK)
  @Post('labels')
  async getPageLabels(@Body() dto: PageIdDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.labelService.getPageLabels(page.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('taxonomy')
  async getPageTaxonomy(@Body() dto: PageIdDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);
    return this.labelService.getPageTaxonomy(page.id);
  }

  /** Applies an existing free label; taxonomy selection has its own endpoint. */
  @HttpCode(HttpStatus.OK)
  @Post('labels/apply')
  async applyPageLabel(@Body() dto: PageLabelDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return this.labelService.applyLabel(page, dto.labelId, user);
  }

  /** Coins an ungrouped label in the page's space and applies it. */
  @HttpCode(HttpStatus.OK)
  @Post('labels/create')
  async createPageLabel(
    @Body() dto: CreatePageLabelDto,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return this.labelService.createAndApplyLabel(page, dto.name, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('labels/remove')
  async removePageLabel(@Body() dto: PageLabelDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    await this.labelService.removeLabel(page, dto.labelId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('taxonomy/select')
  async selectPageTaxonomy(
    @Body() dto: PageTaxonomySelectionDto,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);
    return this.labelService.selectTaxonomyPath(
      page,
      dto.treeId,
      dto.nodeId ?? null,
      user,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('taxonomy/remove')
  async removePageTaxonomy(
    @Body() dto: PageTaxonomyTreeDto,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);
    await this.labelService.removeTaxonomy(page, dto.treeId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('taxonomy/truncate')
  async truncatePageTaxonomy(
    @Body() dto: PageTaxonomyNodeDto,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);
    return this.labelService.truncateTaxonomy(page, dto.nodeId, user);
  }

  /** Who added or removed which label, and when. Shown in the details panel. */
  @HttpCode(HttpStatus.OK)
  @Post(['labels/history', 'taxonomy/history'])
  async getPageLabelHistory(
    @Body() dto: PageIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.labelService.getPageLabelHistory(
      page.id,
      workspace.id,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('backlinks-count')
  async getBacklinksCount(
    @Body() dto: PageIdDto,
    @AuthUser() user: User,
  ): Promise<{ incoming: number; outgoing: number }> {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);

    return this.backlinkService.countByPageId(page.id, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('backlinks')
  async getBacklinks(
    @Body() dto: BacklinksListDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccessService.validateCanView(page, user);

    return this.backlinkService.findByPageId(
      page.id,
      dto.direction,
      user.id,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() createPageDto: CreatePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (createPageDto.parentPageId) {
      // Creating under a parent page - check edit permission on parent
      const parentPage = await this.pageRepo.findById(
        createPageDto.parentPageId,
      );
      if (
        !parentPage ||
        parentPage.deletedAt ||
        parentPage.spaceId !== createPageDto.spaceId
      ) {
        throw new NotFoundException('Parent page not found');
      }
      await this.pageAccessService.validateCanEdit(parentPage, user);
    } else {
      // Creating at root level - require space-level permission
      const ability = await this.spaceAbility.createForUser(
        user,
        createPageDto.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Create, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    const page = await this.pageService.create(
      user.id,
      workspace.id,
      createPageDto,
    );

    const { canEdit, hasRestriction } =
      await this.pageAccessService.validateCanViewWithPermissions(page, user);

    const permissions = { canEdit, hasRestriction };


    if (
      createPageDto.format &&
      createPageDto.format !== 'json' &&
      page.content
    ) {
      const contentOutput =
        createPageDto.format === 'markdown'
          ? jsonToMarkdown(page.content)
          : jsonToHtml(page.content);
      return { ...page, content: contentOutput, permissions };
    }

    return { ...page, permissions };
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(@Body() updatePageDto: UpdatePageDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(updatePageDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const { hasRestriction } = await this.pageAccessService.validateCanEdit(
      page,
      user,
    );

    const updatedPage = await this.pageService.update(
      page,
      updatePageDto,
      user,
    );

    const permissions = { canEdit: true, hasRestriction };

    if (
      updatePageDto.format &&
      updatePageDto.format !== 'json' &&
      updatedPage.content
    ) {
      const contentOutput =
        updatePageDto.format === 'markdown'
          ? jsonToMarkdown(updatedPage.content)
          : jsonToHtml(updatedPage.content);
      return { ...updatedPage, content: contentOutput, permissions };
    }

    return { ...updatedPage, permissions };
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() deletePageDto: DeletePageDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(deletePageDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    const ability = await this.spaceAbility.createForUser(user, page.spaceId);

    if (deletePageDto.permanentlyDelete) {
      // Permanent deletion requires space admin permissions
      if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
        throw new ForbiddenException(
          'Only space admins can permanently delete pages',
        );
      }
      await this.pageService.forceDelete(deletePageDto.pageId, workspace.id);

    } else {
      await this.pageAccessService.validateCanDeleteTree(page, user);

      await this.pageService.removePage(
        deletePageDto.pageId,
        user.id,
        workspace.id,
      );

    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('restore')
  async restore(
    @Body() pageIdDto: PageIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(pageIdDto.pageId);

    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanRestore(page, user);

    await this.pageRepo.restorePage(pageIdDto.pageId, workspace.id);


    return this.pageRepo.findById(pageIdDto.pageId, {
      includeHasChildren: true,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('by-ids')
  async getPagesByIds(
    @Body() dto: PagesByIdsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageService.getPagesByIds(dto.pageIds, user.id, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('edited-by-me')
  async getPagesEditedByMe(
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pageService.getPagesEditedByUser(
      user.id,
      workspace.id,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('recent')
  async getRecentPages(
    @Body() recentPageDto: RecentPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (recentPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        recentPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getRecentSpacePages(
        recentPageDto.spaceId,
        user.id,
        pagination,
      );
    }

    return this.pageService.getRecentPages(user.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('created-by-user')
  async getCreatedByPages(
    @Body() dto: CreatedByUserDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    const targetUserId = dto.userId ?? user.id;

    if (dto.spaceId) {
      const ability = await this.spaceAbility.createForUser(user, dto.spaceId);

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }
    }

    return this.pageService.getCreatedByPages(
      targetUserId,
      user.id,
      pagination,
      dto.spaceId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('trash')
  async getDeletedPages(
    @Body() deletedPageDto: DeletedPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (deletedPageDto.spaceId) {
      const ability = await this.spaceAbility.createForUser(
        user,
        deletedPageDto.spaceId,
      );

      if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      return this.pageService.getDeletedSpacePages(
        deletedPageDto.spaceId,
        user.id,
        pagination,
        ability.can(SpaceCaslAction.Manage, SpaceCaslSubject.Settings),
      );
    }
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history')
  async getPageHistory(
    @Body() dto: PageIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.pageHistoryService.findHistoryByPageIdWithCurrent(
      page.id,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history/info')
  async getPageHistoryInfo(
    @Body() dto: PageHistoryIdDto,
    @AuthUser() user: User,
  ) {
    const history = await this.pageHistoryService.findById(dto.historyId);
    if (!history) {
      throw new NotFoundException('Page history not found');
    }

    // Get the page to check permissions
    const page = await this.pageRepo.findById(history.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return history;
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history/create-version')
  async saveManualVersion(
    @Body() dto: SaveManualPageHistoryDto,
    @AuthUser() user: User,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return this.pageHistoryService.saveManualVersion(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/history/snapshot-before-restore')
  async snapshotBeforeRestore(
    @Body() dto: RestorePageHistoryDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page || page.deletedAt || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanEdit(page, user);

    return (
      this.pageHistoryService as PageHistoryService & {
        snapshotBeforeRestore: (
          page: Page,
          dto: RestorePageHistoryDto,
          user: User,
        ) => Promise<unknown>;
      }
    ).snapshotBeforeRestore(page, dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/sidebar-pages')
  async getSidebarPages(
    @Body() dto: SidebarPageDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    if (!dto.spaceId && !dto.pageId) {
      throw new BadRequestException(
        'Either spaceId or pageId must be provided',
      );
    }
    let spaceId = dto.spaceId;

    if (dto.pageId) {
      const page = await this.pageRepo.findById(dto.pageId);
      if (!page) {
        throw new ForbiddenException();
      }

      spaceId = page.spaceId;
    }

    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    const spaceCanEdit = ability.can(
      SpaceCaslAction.Edit,
      SpaceCaslSubject.Page,
    );

    return this.pageService.getSidebarPages(
      spaceId,
      pagination,
      dto.pageId,
      user.id,
      spaceCanEdit,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('move-to-space')
  async movePageToSpace(
    @Body() dto: MovePageToSpaceDto,
    @AuthUser() user: User,
  ) {
    const movedPage = await this.pageRepo.findById(dto.pageId);
    if (!movedPage) {
      throw new NotFoundException('Page to move not found');
    }
    if (movedPage.spaceId === dto.spaceId) {
      throw new BadRequestException('Page is already in this space');
    }

    const abilities = await Promise.all([
      this.spaceAbility.createForUser(user, movedPage.spaceId),
      this.spaceAbility.createForUser(user, dto.spaceId),
    ]);

    if (
      abilities.some((ability) =>
        ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
      )
    ) {
      throw new ForbiddenException();
    }

    // Check page-level edit permission on the source page
    await this.pageAccessService.validateCanEdit(movedPage, user);

    // Moves only accessible pages; inaccessible child pages become root pages in original space
    await this.pageService.movePageToSpace(movedPage, dto.spaceId, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('duplicate')
  async duplicatePage(@Body() dto: DuplicatePageDto, @AuthUser() user: User) {
    const copiedPage = await this.pageRepo.findById(dto.pageId);
    if (!copiedPage) {
      throw new NotFoundException('Page to copy not found');
    }

    // Check page-level view permission on the source page (need to read to copy)
    // Inaccessible child branches are automatically skipped during duplication
    await this.pageAccessService.validateCanView(copiedPage, user);

    let result;

    // If spaceId is provided, it's a copy to different space
    if (dto.spaceId) {
      const abilities = await Promise.all([
        this.spaceAbility.createForUser(user, copiedPage.spaceId),
        this.spaceAbility.createForUser(user, dto.spaceId),
      ]);

      if (
        abilities.some((ability) =>
          ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page),
        )
      ) {
        throw new ForbiddenException();
      }

      result = await this.pageService.duplicatePage(
        copiedPage,
        dto.spaceId,
        user,
      );

    } else {
      // If no spaceId, it's a duplicate in same space
      const ability = await this.spaceAbility.createForUser(
        user,
        copiedPage.spaceId,
      );
      if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
        throw new ForbiddenException();
      }

      result = await this.pageService.duplicatePage(
        copiedPage,
        undefined,
        user,
      );

    }

    return result;
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  async movePage(@Body() dto: MovePageDto, @AuthUser() user: User) {
    const movedPage = await this.pageRepo.findById(dto.pageId);
    if (!movedPage) {
      throw new NotFoundException('Moved page not found');
    }

    const ability = await this.spaceAbility.createForUser(
      user,
      movedPage.spaceId,
    );

    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }

    // Check page-level edit permission
    await this.pageAccessService.validateCanEdit(movedPage, user);

    // If moving to a new parent, check permission on the target parent
    if (dto.parentPageId && dto.parentPageId !== movedPage.parentPageId) {
      const targetParent = await this.pageRepo.findById(dto.parentPageId);
      if (!targetParent || targetParent.deletedAt) {
        throw new NotFoundException('Target parent page not found');
      }
      await this.pageAccessService.validateCanEdit(targetParent, user);
    }

    return this.pageService.movePage(dto, movedPage);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/breadcrumbs')
  async getPageBreadcrumbs(@Body() dto: PageIdDto, @AuthUser() user: User) {
    const page = await this.pageRepo.findById(dto.pageId);
    if (!page) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    return this.pageService.getPageBreadCrumbs(page.id);
  }
}
