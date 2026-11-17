import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { LabelTreeRepo } from '@tcc-docs/db/repos/label/label-tree.repo';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { LabelAdminService } from './label-admin.service';
import { LabelPermissionService } from './label-permission.service';
import {
  CreateLabelNodeDto,
  CreateLabelTreeDto,
  LabelNodeIdDto,
  LabelTreeIdDto,
  ListOwnedLabelsDto,
  MoveLabelNodeDto,
  UpdateLabelNodeDto,
  UpdateLabelTreeDto,
} from './dto/label.dto';

@UseGuards(JwtAuthGuard)
@Controller('label-trees')
export class LabelTreeController {
  constructor(
    private readonly labelAdminService: LabelAdminService,
    private readonly labelPermission: LabelPermissionService,
    private readonly labelTreeRepo: LabelTreeRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('manage')
  async listOwned(
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
  async create(
    @Body() dto: CreateLabelTreeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const owner = await this.labelPermission.resolveManageableOwner(
      user,
      workspace,
      dto.spaceId,
    );
    return this.labelAdminService.createTree(owner, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateLabelTreeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const tree = await this.findTreeOrThrow(dto.treeId);
    await this.labelPermission.assertCanManage(user, workspace, tree);
    return this.labelAdminService.updateTree(tree, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('impact')
  async impact(
    @Body() dto: LabelTreeIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const tree = await this.findTreeOrThrow(dto.treeId);
    await this.labelPermission.assertCanManage(user, workspace, tree);
    return {
      nodeCount: (await this.labelTreeRepo.findNodesByTreeIds([tree.id])).length,
      pageCount: await this.labelAdminService.countTreeAffectedPages(tree.id, user.id),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: LabelTreeIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const tree = await this.findTreeOrThrow(dto.treeId);
    await this.labelPermission.assertCanManage(user, workspace, tree);
    await this.labelAdminService.deleteTree(tree, user.id);
  }

  private async findTreeOrThrow(treeId: string) {
    const tree = await this.labelTreeRepo.findById(treeId);
    if (!tree) throw new NotFoundException('Label tree not found');
    return tree;
  }
}

@UseGuards(JwtAuthGuard)
@Controller('label-nodes')
export class LabelNodeController {
  constructor(
    private readonly labelAdminService: LabelAdminService,
    private readonly labelPermission: LabelPermissionService,
    private readonly labelTreeRepo: LabelTreeRepo,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('create')
  async create(
    @Body() dto: CreateLabelNodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const tree = await this.findTreeOrThrow(dto.treeId);
    await this.labelPermission.assertCanManage(user, workspace, tree);
    return this.labelAdminService.createNode(
      { workspaceId: tree.workspaceId, spaceId: tree.spaceId },
      dto,
      user.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() dto: UpdateLabelNodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const node = await this.findNodeOrThrow(dto.nodeId);
    await this.labelPermission.assertCanManage(user, workspace, node);
    return this.labelAdminService.updateNode(node, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('move-impact')
  async moveImpact(
    @Body() dto: MoveLabelNodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const node = await this.findNodeOrThrow(dto.nodeId);
    await this.labelPermission.assertCanManage(user, workspace, node);
    return this.labelAdminService.getMoveImpact(node, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('move')
  async move(
    @Body() dto: MoveLabelNodeDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const node = await this.findNodeOrThrow(dto.nodeId);
    await this.labelPermission.assertCanManage(user, workspace, node);
    return this.labelAdminService.moveNode(node, dto, user.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete-impact')
  async deleteImpact(
    @Body() dto: LabelNodeIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const node = await this.findNodeOrThrow(dto.nodeId);
    await this.labelPermission.assertCanManage(user, workspace, node);
    return {
      nodeCount: await this.labelTreeRepo.countSubtreeNodes(node.id),
      pageCount: await this.labelAdminService.countNodeAffectedPages(node.id, user.id),
    };
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async delete(
    @Body() dto: LabelNodeIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const node = await this.findNodeOrThrow(dto.nodeId);
    await this.labelPermission.assertCanManage(user, workspace, node);
    await this.labelAdminService.deleteNode(node, user.id);
  }

  private async findTreeOrThrow(treeId: string) {
    const tree = await this.labelTreeRepo.findById(treeId);
    if (!tree) throw new NotFoundException('Label tree not found');
    return tree;
  }

  private async findNodeOrThrow(nodeId: string) {
    const node = await this.labelTreeRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Label node not found');
    return node;
  }
}
