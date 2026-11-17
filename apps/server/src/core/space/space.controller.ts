import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  UseGuards,
} from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { SpaceIdDto } from './dto/space-id.dto';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../casl/interfaces/space-ability.type';
import { UpdateSpaceDto } from './dto/update-space.dto';
import { SpaceAuthorizationService } from './services/space-authorization.service';
import { SpacePermissionService } from './services/space-permission.service';
import { UpdateSpacePermissionsDto } from './dto/update-space-permissions.dto';
import { UpdateSpaceMemberPermissionDto } from './dto/update-space-member-permission.dto';
import { ListSpacePermissionsDto } from './dto/list-space-permissions.dto';
import { ListSpacesDto } from './dto/list-spaces.dto';

@UseGuards(JwtAuthGuard)
// TCC: há um único space (seed). Criar, arquivar e restaurar spaces foi
// removido da API; ver docs/tcc/02-cortes-de-funcionalidade.md.
@Controller('spaces')
export class SpaceController {
  constructor(
    private readonly spaceService: SpaceService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly authorization: SpaceAuthorizationService,
    private readonly permissionService: SpacePermissionService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('/')
  async getWorkspaceSpaces(
    @Body()
    pagination: ListSpacesDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.spaceService.getWorkspaceSpaces(user, workspace.id, pagination);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  async getSpaceInfo(
    @Body() spaceIdDto: SpaceIdDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const permission = await this.authorization.requireView(
      user,
      spaceIdDto.spaceId,
    );
    const space = await this.spaceService.getSpaceInfo(
      spaceIdDto.spaceId,
      workspace.id,
    );

    if (!space) {
      throw new NotFoundException('Space not found');
    }

    return { ...space, permission };
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  listPermissions(
    @Body() dto: ListSpacePermissionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.permissionService.listPermissions(
      user,
      workspace.id,
      dto.spaceId,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions/update')
  updatePermissions(
    @Body() dto: UpdateSpacePermissionsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.permissionService.updatePermissions(user, workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions/member/update')
  updateMemberPermission(
    @Body() dto: UpdateSpaceMemberPermissionDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.permissionService.updateMemberPermission(
      user,
      workspace.id,
      dto,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateSpace(
    @Body() updateSpaceDto: UpdateSpaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      updateSpaceDto.spaceId,
    );
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }
    return this.spaceService.updateSpace(updateSpaceDto, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('members')
  async getSpaceMembers(
    @Body() spaceIdDto: SpaceIdDto,
    @Body()
    pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      spaceIdDto.spaceId,
    );

    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }

    return this.permissionService.listAccessibleMembers(
      user,
      workspace.id,
      spaceIdDto.spaceId,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('members/assignable')
  async getSpaceAssignableUsers(
    @Body() spaceIdDto: SpaceIdDto,
    @Body()
    pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = await this.spaceAbility.createForUser(
      user,
      spaceIdDto.spaceId,
    );

    if (ability.cannot(SpaceCaslAction.Read, SpaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }

    return this.permissionService.listAccessibleMembers(
      user,
      workspace.id,
      spaceIdDto.spaceId,
      pagination,
    );
  }
}
