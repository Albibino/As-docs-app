import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LabelService } from './label.service';
import { LabelAdminService } from './label-admin.service';
import { LabelPermissionService } from './label-permission.service';
import {
  CreateLabelDto,
  FindPagesByLabelDto,
  LabelIdDto,
  ListLabelsDto,
  ListOwnedLabelsDto,
  UpdateLabelDto,
} from './dto/label.dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { LabelRepo } from '@tcc-docs/db/repos/label/label.repo';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';

@UseGuards(JwtAuthGuard)
@Controller('labels')
export class LabelController {
  constructor(
    private readonly labelService: LabelService,
    private readonly labelAdminService: LabelAdminService,
    private readonly labelPermission: LabelPermissionService,
    private readonly labelRepo: LabelRepo,
  ) {}

  /**
   * What a page in this space may apply — workspace taxonomy plus the space's
   * own. Backs the picker.
   */
  @HttpCode(HttpStatus.OK)
  @Post('/')
  async getAvailableLabels(
    @Body() dto: ListLabelsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.labelPermission.assertCanReadSpace(user, workspace, dto.spaceId);
    return this.labelService.getAvailableLabels(workspace.id, dto.spaceId);
  }

  /**
   * Every label the caller could meet anywhere in the workspace. Backs the
   * search filter, which spans spaces and so has no single scope to resolve.
   */
  @HttpCode(HttpStatus.OK)
  @Post('searchable')
  async getSearchableLabels(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.labelService.getSearchableLabels(workspace.id, user.id);
  }

  /** Labels owned by one scope — what an admin screen edits. */
  @HttpCode(HttpStatus.OK)
  @Post('manage')
  async listOwnedLabels(
    @Body() dto: ListOwnedLabelsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const owner = await this.labelPermission.resolveManageableOwner(
      user,
      workspace,
      dto.spaceId,
    );
    return this.labelAdminService.listOwned(owner);
  }

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async createLabel(
    @Body() dto: CreateLabelDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const owner = await this.labelPermission.resolveManageableOwner(
      user,
      workspace,
      dto.spaceId,
    );
    return this.labelAdminService.createLabel(owner, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateLabel(
    @Body() dto: UpdateLabelDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const label = await this.findLabelOrThrow(dto.labelId);
    await this.labelPermission.assertCanManage(user, workspace, label);
    return this.labelAdminService.updateLabel(label, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async deleteLabel(
    @Body() dto: LabelIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const label = await this.findLabelOrThrow(dto.labelId);
    await this.labelPermission.assertCanManage(user, workspace, label);
    await this.labelAdminService.deleteLabel(label, user.id);
  }

  /** How many pages a delete would strip the label from. */
  @HttpCode(HttpStatus.OK)
  @Post('usage')
  async getLabelUsage(
    @Body() dto: LabelIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const label = await this.findLabelOrThrow(dto.labelId);
    await this.labelPermission.assertCanManage(user, workspace, label);
    return {
      pageCount: await this.labelAdminService.countLabelPages(
        label.id,
        user.id,
      ),
    };
  }

  /**
   * A single label's identity, for the page that lists everything carrying it.
   * Workspace-scoped labels are visible to any member; a space-scoped one is
   * only disclosed to someone who can read that space.
   */
  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getLabelInfo(
    @Body() dto: LabelIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const target = await this.labelService.getLabelInfo(dto.labelId);
    if (!target) {
      throw new NotFoundException('Label not found');
    }
    if (target.workspaceId !== workspace.id) {
      throw new NotFoundException('Label not found');
    }
    if (target.spaceId) {
      await this.labelPermission.assertCanReadSpace(
        user,
        workspace,
        target.spaceId,
      );
    }
    return target;
  }

  @HttpCode(HttpStatus.OK)
  @Post('pages')
  async findPagesByLabel(
    @Body() dto: FindPagesByLabelDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    if (dto.spaceId) {
      await this.labelPermission.assertCanReadSpace(
        user,
        workspace,
        dto.spaceId,
      );
    }

    const target = await this.labelService.getLabelInfo(dto.labelId);
    if (!target) {
      throw new NotFoundException('Label not found');
    }
    if (target.workspaceId !== workspace.id) {
      throw new NotFoundException('Label not found');
    }
    if (target.spaceId) {
      await this.labelPermission.assertCanReadSpace(
        user,
        workspace,
        target.spaceId,
      );
    }

    return this.labelService.findPagesByLabel(
      target.id,
      user.id,
      {
        spaceId: dto.spaceId,
        query: pagination.query,
        pagination,
      },
      target.targetType,
    );
  }

  private async findLabelOrThrow(labelId: string) {
    const label = await this.labelRepo.findById(labelId);
    if (!label) {
      throw new NotFoundException('Label not found');
    }
    return label;
  }
}
