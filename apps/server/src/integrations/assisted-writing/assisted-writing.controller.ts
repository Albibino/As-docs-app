import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { User, Workspace } from '@tcc-docs/db/types/entity.types';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { AuthWorkspace } from '../../common/decorators/auth-workspace.decorator';
import { PageAccessService } from '../../core/page/page-access/page-access.service';
import { AssistedWritingService } from './assisted-writing.service';
import type {
  AssistedWritingInput,
  AssistedWritingVersionInput,
} from './assisted-writing.types';

@UseGuards(JwtAuthGuard)
@Controller('ai/assisted-writing')
export class AssistedWritingController {
  constructor(
    private readonly service: AssistedWritingService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccess: PageAccessService,
  ) {}

  @Post('stream')
  @HttpCode(HttpStatus.OK)
  async stream(
    @Body() input: AssistedWritingInput,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    const page = await this.pageRepo.findById(input.pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);
    this.service.validateInput(input);
    const spacePages = await this.service.listSpacePageIndex({
      spaceId: page.spaceId,
      workspaceId: workspace.id,
      userId: user.id,
      excludePageId: page.id,
    });

    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort('upstream_timeout'), 120_000);
    request.raw.once('aborted', () => abort.abort('client_disconnected'));
    reply.raw.once('close', () => abort.abort('client_disconnected'));
    const startedAt = Date.now();
    try {
      const upstream = await this.service.openStream(
        input,
        workspace.id,
        abort.signal,
        spacePages,
      );
      reply.status(upstream.status);
      upstream.headers.forEach((value, name) => {
        if (
          [
            'content-type',
            'cache-control',
            'retry-after',
            'x-request-id',
          ].includes(name.toLowerCase())
        ) {
          reply.header(name, value);
        }
      });
      reply.header('x-accel-buffering', 'no');
      if (!upstream.body) {
        clearTimeout(timeout);
        return reply.send();
      }
      const stream = Readable.fromWeb(upstream.body as any);
      const cleanup = () => clearTimeout(timeout);
      stream.once('end', cleanup);
      stream.once('error', cleanup);
      stream.once('close', cleanup);
      return reply.send(
        stream.pipe(
          this.service.createMetricsTransform(workspace.id, startedAt),
        ),
      );
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  /**
   * Same index the model receives. The client needs it to resolve the pageIds
   * the model emits into complete mention nodes and to render the link review.
   */
  @Post('space-pages')
  @HttpCode(HttpStatus.OK)
  async spacePages(
    @Body() input: { pageId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(input.pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanView(page, user);
    const pages = await this.service.listSpacePageIndex({
      spaceId: page.spaceId,
      workspaceId: workspace.id,
      userId: user.id,
      excludePageId: page.id,
    });
    return { pages };
  }

  @Post('version')
  async recordVersion(
    @Body() input: AssistedWritingVersionInput,
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(input.pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);
    return this.service.recordReferenceVersion(input, page, user);
  }

  @Post('session/end')
  async endSession(
    @Body() input: { pageId: string; sessionId: string },
    @AuthUser() user: User,
    @AuthWorkspace() workspace: Workspace,
  ) {
    const page = await this.pageRepo.findById(input.pageId);
    if (!page || page.workspaceId !== workspace.id) {
      throw new NotFoundException('Page not found');
    }
    await this.pageAccess.validateCanEdit(page, user);
    await this.service.endSession(
      input.sessionId,
      page.id,
      workspace.id,
      user.id,
    );
    return { success: true };
  }
}
