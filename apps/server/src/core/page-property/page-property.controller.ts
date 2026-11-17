import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ZodError } from 'zod';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
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
import { SpaceService } from '../space/services/space.service';
import {
  CreatePagePropertyDefinitionDto,
  CreateWorkspacePagePropertyDefinitionDto,
  DeletePagePropertyDefinitionDto,
  GetPagePropertyValuesDto,
  ListPagePropertyDefinitionsDto,
  SetPagePropertyValueDto,
  UpdatePagePropertyDefinitionDto,
} from './dto/page-property.dto';
import { PagePropertyService } from './page-property.service';

@UseGuards(JwtAuthGuard)
@Controller('page-properties')
export class PagePropertyController {
  constructor(
    private readonly pagePropertyService: PagePropertyService,
    private readonly spaceService: SpaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('definitions/workspace/list')
  listWorkspaceDefinitions(
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.requireWorkspacePermission(user, workspace, WorkspaceCaslAction.Read);
    return this.pagePropertyService.listWorkspaceDefinitions(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('definitions/workspace/create')
  createWorkspaceDefinition(
    @Body() dto: CreateWorkspacePagePropertyDefinitionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.requireWorkspacePermission(
      user,
      workspace,
      WorkspaceCaslAction.Manage,
    );
    return this.withSchemaErrors(() =>
      this.pagePropertyService.createDefinition({
        ...dto,
        spaceId: null,
        workspaceId: workspace.id,
        userId: user.id,
      }),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('definitions/list')
  async listDefinitions(
    @Body() dto: ListPagePropertyDefinitionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireSettingsPermission(
      dto.spaceId,
      workspace.id,
      user,
      SpaceCaslAction.Read,
    );
    return this.pagePropertyService.listDefinitions(dto.spaceId, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('definitions/create')
  async createDefinition(
    @Body() dto: CreatePagePropertyDefinitionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.requireSettingsPermission(
      dto.spaceId,
      workspace.id,
      user,
      SpaceCaslAction.Manage,
    );
    return this.withSchemaErrors(() =>
      this.pagePropertyService.createDefinition({
        ...dto,
        workspaceId: workspace.id,
        userId: user.id,
      }),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('definitions/update')
  async updateDefinition(
    @Body() dto: UpdatePagePropertyDefinitionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const definition = await this.pagePropertyService.getDefinition(
      dto.propertyId,
      workspace.id,
    );
    await this.requireDefinitionManagePermission(definition, user, workspace);
    return this.withSchemaErrors(() =>
      this.pagePropertyService.updateDefinition({
        ...dto,
        workspaceId: workspace.id,
      }),
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('definitions/delete')
  async deleteDefinition(
    @Body() dto: DeletePagePropertyDefinitionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const definition = await this.pagePropertyService.getDefinition(
      dto.propertyId,
      workspace.id,
    );
    await this.requireDefinitionManagePermission(definition, user, workspace);
    return this.pagePropertyService.deleteDefinition(
      dto.propertyId,
      workspace.id,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('values/get')
  getValues(
    @Body() dto: GetPagePropertyValuesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.pagePropertyService.getValues(dto.pageId, workspace.id, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('values/set')
  setValue(
    @Body() dto: SetPagePropertyValueDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.withSchemaErrors(() =>
      this.pagePropertyService.setValue({
        ...dto,
        workspaceId: workspace.id,
        user,
      }),
    );
  }

  private async requireSettingsPermission(
    spaceId: string,
    workspaceId: string,
    user: User,
    action: SpaceCaslAction.Read | SpaceCaslAction.Manage,
  ) {
    await this.spaceService.getSpaceInfo(spaceId, workspaceId);
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(action, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  private requireWorkspacePermission(
    user: User,
    workspace: Workspace,
    action: WorkspaceCaslAction.Read | WorkspaceCaslAction.Manage,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(action, WorkspaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
  }

  private async requireDefinitionManagePermission(
    definition: { spaceId: string | null },
    user: User,
    workspace: Workspace,
  ) {
    if (definition.spaceId) {
      return this.requireSettingsPermission(
        definition.spaceId,
        workspace.id,
        user,
        SpaceCaslAction.Manage,
      );
    }
    this.requireWorkspacePermission(
      user,
      workspace,
      WorkspaceCaslAction.Manage,
    );
  }

  private async withSchemaErrors<T>(operation: () => Promise<T>): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (error instanceof ZodError) {
        throw new BadRequestException({
          message: 'Invalid page property',
          issues: error.issues,
        });
      }
      throw error;
    }
  }
}
