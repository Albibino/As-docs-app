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
import { FavoriteService } from './services/favorite.service';
import { AddFavoriteDto, RemoveFavoriteDto } from './dto/favorite.dto';
import { FavoriteIdsDto } from './dto/favorite-ids.dto';
import { ListFavoritesDto } from './dto/list-favorites.dto';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { Page, User, Workspace } from '@tcc-docs/db/types/entity.types';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { FavoriteType } from '@tcc-docs/db/repos/favorite/favorite.repo';
import { SpaceAuthorizationService } from '../space/services/space-authorization.service';

@UseGuards(JwtAuthGuard)
@Controller('favorites')
export class FavoriteController {
  constructor(
    private readonly favoriteService: FavoriteService,
    private readonly pageRepo: PageRepo,
    private readonly spaceRepo: SpaceRepo,
    private readonly spaceAuthorization: SpaceAuthorizationService,
    private readonly pageAccessService: PageAccessService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post('add')
  async addFavorite(
    @Body() dto: AddFavoriteDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const resolved = await this.resolveAndValidate(dto, user, workspace.id);

    await this.favoriteService.addFavorite(user.id, workspace.id, {
      type: dto.type,
      pageId: dto.pageId,
      spaceId: dto.type === 'space' ? resolved.spaceId : undefined,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove')
  async removeFavorite(
    @Body() dto: RemoveFavoriteDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.resolveAndValidate(dto, user, workspace.id);

    await this.favoriteService.removeFavorite(user.id, {
      type: dto.type,
      pageId: dto.pageId,
      spaceId: dto.spaceId,
    });
  }

  @HttpCode(HttpStatus.OK)
  @Post('ids')
  async getFavoriteIds(
    @Body() dto: FavoriteIdsDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.favoriteService.getFavoriteIds(
      user.id,
      workspace.id,
      dto.type as FavoriteType,
      dto.spaceId,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post()
  async getUserFavorites(
    @Body() dto: ListFavoritesDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    return this.favoriteService.getUserFavorites(
      user.id,
      workspace.id,
      pagination,
      dto.type as FavoriteType | undefined,
      dto.spaceId,
    );
  }

  private async resolveAndValidate(
    dto: AddFavoriteDto | RemoveFavoriteDto,
    user: User,
    workspaceId: string,
  ): Promise<{ spaceId: string; page?: Page }> {
    if (dto.type === 'page') {
      if (!dto.pageId) throw new BadRequestException('pageId is required');
      const page = await this.pageRepo.findById(dto.pageId);
      if (!page) throw new NotFoundException('Page not found');
      await this.pageAccessService.validateCanView(page, user);
      return { spaceId: page.spaceId, page };
    }

    if (dto.type === 'space') {
      if (!dto.spaceId) throw new BadRequestException('spaceId is required');
      const space = await this.spaceRepo.findById(dto.spaceId, workspaceId);
      if (!space) throw new NotFoundException('Space not found');
      await this.spaceAuthorization.requireView(user, space.id);
      return { spaceId: space.id };
    }

    throw new BadRequestException('Invalid favorite type');
  }

}
