import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { User } from '@tcc-docs/db/types/entity.types';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageIdDto } from './dto/page.dto';
import {
  AddPagePermissionDto,
  RemovePagePermissionDto,
  UpdatePagePermissionDto,
} from './dto/page-permission.dto';
import { PagePermissionService } from './services/page-permission.service';

@UseGuards(JwtAuthGuard)
@Controller('pages')
export class PagePermissionController {
  constructor(private readonly pagePermissionService: PagePermissionService) {}

  @HttpCode(HttpStatus.OK)
  @Post('permission-info')
  getRestrictionInfo(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.pagePermissionService.getRestrictionInfo(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('permissions')
  listPermissions(
    @Body() dto: PageIdDto,
    @Body() pagination: PaginationOptions,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.listPermissions(
      dto.pageId,
      user,
      pagination,
    );
  }

  @HttpCode(HttpStatus.OK)
  @Post('permission-recipients')
  listRecipients(
    @Body() dto: PageIdDto & PaginationOptions,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.listRecipients(dto.pageId, user, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('restrict')
  restrictPage(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.pagePermissionService.restrictPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-restriction')
  unrestrictPage(@Body() dto: PageIdDto, @AuthUser() user: User) {
    return this.pagePermissionService.unrestrictPage(dto.pageId, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('add-permission')
  addPermission(@Body() dto: AddPagePermissionDto, @AuthUser() user: User) {
    return this.pagePermissionService.addPermission(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('remove-permission')
  removePermission(
    @Body() dto: RemovePagePermissionDto,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.removePermission(dto, user);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update-permission')
  updatePermissionRole(
    @Body() dto: UpdatePagePermissionDto,
    @AuthUser() user: User,
  ) {
    return this.pagePermissionService.updatePermissionRole(dto, user);
  }
}
