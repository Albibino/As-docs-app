import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { User, Workspace } from '../../database/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import {
  CreateFolderImportDto,
  GetFolderImportDto,
  MAX_FOLDER_IMPORT_FILE_SIZE,
} from './dto/folder-import-api.dto';
import { FolderImportSessionService } from './services/folder-import-session.service';
import { buildFolderImportManifest } from './utils/folder-import-manifest';
import { FileInterceptor } from '../../common/interceptors/file.interceptor';
import { FolderImportUploadService } from './services/folder-import-upload.service';
import { FolderImportRunService } from './services/folder-import-run.service';

@UseGuards(JwtAuthGuard)
@Controller('folder-imports')
export class FolderImportController {
  constructor(
    private readonly folderImportSessionService: FolderImportSessionService,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly folderImportUploadService: FolderImportUploadService,
    private readonly folderImportRunService: FolderImportRunService,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Body() dto: CreateFolderImportDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertCanEditSpace(user, dto.spaceId);

    let manifest;
    try {
      manifest = buildFolderImportManifest(dto.entries);
    } catch (error) {
      throw new BadRequestException(
        error instanceof Error ? error.message : 'Invalid folder manifest',
      );
    }

    const session = await this.folderImportSessionService.createSession({
      rootName: dto.rootName,
      manifest,
      creatorId: user.id,
      spaceId: dto.spaceId,
      workspaceId: workspace.id,
    });

    return { session, manifest };
  }

  @Get(':id')
  async get(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @Query() pagination: GetFolderImportDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const result = await this.folderImportSessionService.getSession(
      sessionId,
      workspace.id,
      pagination,
    );
    await this.assertCanEditSpace(user, result.session.spaceId!);
    const { report } = await this.folderImportRunService.getResult(
      result.session,
    );
    return { ...result, report };
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.ACCEPTED)
  async start(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSessionPermission(sessionId, user, workspace.id);
    return this.folderImportRunService.start(sessionId, workspace.id);
  }

  @Post(':id/retry')
  @HttpCode(HttpStatus.ACCEPTED)
  async retry(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSessionPermission(sessionId, user, workspace.id);
    return this.folderImportRunService.start(sessionId, workspace.id);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    await this.assertSessionPermission(sessionId, user, workspace.id);
    return this.folderImportRunService.cancel(sessionId, workspace.id);
  }

  @Put(':id/items/:itemId/content')
  @UseInterceptors(FileInterceptor)
  async uploadItem(
    @Param('id', new ParseUUIDPipe()) sessionId: string,
    @Param('itemId', new ParseUUIDPipe()) itemId: string,
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const session = await this.folderImportSessionService.getSessionTask(
      sessionId,
      workspace.id,
    );
    await this.assertCanEditSpace(user, session.spaceId!);

    let file;
    try {
      file = await req.file({
        limits: {
          fileSize: MAX_FOLDER_IMPORT_FILE_SIZE,
          fields: 0,
          files: 1,
        },
      });
    } catch (error: any) {
      if (error?.statusCode === 413) {
        throw new BadRequestException('Folder import file exceeds 100 MB');
      }
      throw error;
    }
    if (!file) {
      throw new BadRequestException('Folder import file is required');
    }

    return this.folderImportUploadService.uploadItem({
      sessionId,
      itemId,
      workspaceId: workspace.id,
      filePromise: Promise.resolve(file),
    });
  }

  private async assertCanEditSpace(user: User, spaceId: string) {
    const ability = await this.spaceAbility.createForUser(user, spaceId);
    if (ability.cannot(SpaceCaslAction.Edit, SpaceCaslSubject.Page)) {
      throw new ForbiddenException();
    }
  }

  private async assertSessionPermission(
    sessionId: string,
    user: User,
    workspaceId: string,
  ) {
    const session = await this.folderImportSessionService.getSessionTask(
      sessionId,
      workspaceId,
    );
    await this.assertCanEditSpace(user, session.spaceId!);
  }
}
