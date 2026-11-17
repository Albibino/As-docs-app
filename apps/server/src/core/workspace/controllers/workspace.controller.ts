import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { WorkspaceService } from '../services/workspace.service';
import { UpdateWorkspaceDto } from '../dto/update-workspace.dto';
import { AuthUser } from '../../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../../common/decorators/auth-workspace.decorator';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { Public } from '../../../common/decorators/public.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { User, Workspace } from '@tcc-docs/db/types/entity.types';
import WorkspaceAbilityFactory from '../../casl/abilities/workspace-ability.factory';
import {
  WorkspaceCaslAction,
  WorkspaceCaslSubject,
} from '../../casl/interfaces/workspace-ability.type';
import { FileInterceptor } from '../../../common/interceptors/file.interceptor';
import { PdfExportAssetsService } from '../../../integrations/export/pdf/pdf-export-assets.service';

/**
 * TCC: o workspace é único e criado pelo seed (`TccSeedService`). Convites,
 * bootstrap do diretório externo, verificação de hostname e gestão de
 * membros foram removidos: os dois usuários são fixos. Ver
 * docs/tcc/02-cortes-de-funcionalidade.md.
 */
@UseGuards(JwtAuthGuard)
@Controller('workspace')
export class WorkspaceController {
  constructor(
    private readonly workspaceService: WorkspaceService,
    private readonly workspaceAbility: WorkspaceAbilityFactory,
    private readonly pdfExportAssets: PdfExportAssetsService,
  ) {}

  @Public()
  @HttpCode(HttpStatus.OK)
  @Post('/public')
  async getWorkspacePublicInfo(@Req() req: any) {
    return this.workspaceService.getWorkspacePublicData(req.raw.workspaceId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('/info')
  async getWorkspace(@AuthWorkspace() workspace: Workspace) {
    return this.workspaceService.getWorkspaceInfo(workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async updateWorkspace(
    @Body() dto: UpdateWorkspaceDto,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.ensureCanManageWorkspaceSettings(user, workspace);

    return this.workspaceService.update(workspace.id, dto);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pdf-export-assets')
  @UseInterceptors(FileInterceptor)
  async uploadPdfExportAsset(
    @Req() req: any,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.ensureCanManageWorkspaceSettings(user, workspace);

    let file;
    try {
      file = await req.file({
        limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      });
    } catch (error: any) {
      if (error?.statusCode === 413) {
        throw new BadRequestException(
          'PDF export images must be 10 MB or smaller.',
        );
      }
      throw error;
    }

    if (!file) throw new BadRequestException('Image file is required.');
    return this.pdfExportAssets.upload(file, workspace.id);
  }

  @HttpCode(HttpStatus.OK)
  @Post('pdf-export-assets/delete')
  async deletePdfExportAsset(
    @Body('assetId') assetId: string,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    this.ensureCanManageWorkspaceSettings(user, workspace);
    await this.pdfExportAssets.remove(workspace.id, assetId);
  }

  /** Somente leitura: lista os dois usuários fixos do TCC. */
  @HttpCode(HttpStatus.OK)
  @Post('members')
  async getWorkspaceMembers(
    @Body()
    pagination: PaginationOptions,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (ability.cannot(WorkspaceCaslAction.Read, WorkspaceCaslSubject.Member)) {
      throw new ForbiddenException();
    }

    return this.workspaceService.getWorkspaceUsers(workspace.id, pagination);
  }

  private ensureCanManageWorkspaceSettings(user: User, workspace: Workspace) {
    const ability = this.workspaceAbility.createForUser(user, workspace);
    if (
      ability.cannot(WorkspaceCaslAction.Manage, WorkspaceCaslSubject.Settings)
    ) {
      throw new ForbiddenException();
    }
  }
}
