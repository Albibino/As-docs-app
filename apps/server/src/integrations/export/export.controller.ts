import {
  Body,
  Controller,
  ForbiddenException,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportPageDto, ExportSpaceDto } from './dto/export-dto';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@tcc-docs/db/types/entity.types';
import SpaceAbilityFactory from '../../core/casl/abilities/space-ability.factory';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../core/casl/interfaces/space-ability.type';
import { FastifyReply } from 'fastify';
import { getExportExtension } from './utils';
import { getMimeType, sanitizeFileName } from '../../common/helpers';
import * as path from 'path';

@Controller()
export class ExportController {
  constructor(
    private readonly exportService: ExportService,
    private readonly pageRepo: PageRepo,
    private readonly spaceAbility: SpaceAbilityFactory,
    private readonly pageAccessService: PageAccessService,
  ) {}

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('pages/export')
  async exportPage(
    @Body() dto: ExportPageDto,
    @AuthUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(dto.pageId, {
      includeContent: true,
    });

    if (!page || page.deletedAt) {
      throw new NotFoundException('Page not found');
    }

    await this.pageAccessService.validateCanView(page, user);

    const result = await this.exportService.exportPages(
      dto.pageId,
      dto.format,
      dto.includeAttachments,
      dto.includeChildren,
      user.id,
    );


    if (result.type === 'file') {
      const ext = getExportExtension(dto.format);
      const fileName =
        sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
        ext;
      const contentType = getMimeType(path.extname(fileName));

      res.headers({
        'Content-Type': contentType,
        'Content-Disposition':
          'attachment; filename="' + encodeURIComponent(fileName) + '"',
      });

      res.send(result.content);
    } else {
      const fileName =
        sanitizeFileName(page.title || 'untitled', { preserveSpaces: true }) +
        '.zip';

      res.headers({
        'Content-Type': 'application/zip',
        'Content-Disposition':
          'attachment; filename="' + encodeURIComponent(fileName) + '"',
      });

      res.send(result.stream);
    }
  }

  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @Post('spaces/export')
  async exportSpace(
    @Body() dto: ExportSpaceDto,
    @AuthUser() user: User,
    @Res() res: FastifyReply,
  ) {
    const ability = await this.spaceAbility.createForUser(user, dto.spaceId);
    if (ability.cannot(SpaceCaslAction.Manage, SpaceCaslSubject.Settings)) {
      throw new ForbiddenException();
    }

    const exportFile = await this.exportService.exportSpace(
      dto.spaceId,
      dto.format,
      dto.includeAttachments,
      user.id,
    );


    res.headers({
      'Content-Type': 'application/zip',
      'Content-Disposition':
        'attachment; filename="' +
        encodeURIComponent(
          sanitizeFileName(exportFile.fileName, { preserveSpaces: true }),
        ) +
        '"',
    });

    res.send(exportFile.fileStream);
  }
}
