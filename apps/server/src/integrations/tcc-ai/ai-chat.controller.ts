import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { AuthUser } from '../../common/decorators/auth-user.decorator';
import { User } from '@tcc-docs/db/types/entity.types';
import { AiChatService, SendMessageInput } from './ai-chat.service';
import { AiIndexingService } from './ai-indexing.service';

/**
 * Rotas do chat em `/api/ai/chats/*`, no formato que o cliente (`features/assistant`)
 * já usava. O envio responde em SSE (`data: {...}\n\n`).
 */
@UseGuards(JwtAuthGuard)
@Controller('ai/chats')
export class AiChatController {
  constructor(
    private readonly chats: AiChatService,
    private readonly indexing: AiIndexingService,
  ) {}

  @HttpCode(HttpStatus.OK)
  @Post()
  list(@Body() body: { limit?: number }, @AuthUser() user: User) {
    return this.chats.listChats(user, body?.limit ?? 30);
  }

  @HttpCode(HttpStatus.OK)
  @Post('search')
  search(@Body() body: { query: string }, @AuthUser() user: User) {
    return this.chats.searchChats(user, body?.query);
  }

  @HttpCode(HttpStatus.OK)
  @Post('info')
  info(@Body() body: { chatId: string }, @AuthUser() user: User) {
    return this.chats.getChatInfo(user, body?.chatId);
  }

  @HttpCode(HttpStatus.OK)
  @Post('update')
  async update(
    @Body() body: { chatId: string; title: string },
    @AuthUser() user: User,
  ) {
    await this.chats.updateTitle(user, body?.chatId, body?.title);
  }

  @HttpCode(HttpStatus.OK)
  @Post('delete')
  async remove(@Body() body: { chatId: string }, @AuthUser() user: User) {
    await this.chats.deleteChat(user, body?.chatId);
  }

  /**
   * Dispara um ciclo de indexação agora (além do intervalo automático).
   * Útil para a demonstração e para os testes ponta a ponta.
   */
  @HttpCode(HttpStatus.OK)
  @Post('index/run')
  async runIndex() {
    return { indexed: await this.indexing.runOnce() };
  }

  @Post('send')
  async send(
    @Body() body: SendMessageInput,
    @AuthUser() user: User,
    @Req() request: FastifyRequest,
    @Res() reply: FastifyReply,
  ) {
    this.chats.validate(body);
    const abort = new AbortController();
    const timeout = setTimeout(() => abort.abort('upstream_timeout'), 120_000);
    request.raw.once('aborted', () => abort.abort('client_disconnected'));

    reply.hijack();
    reply.raw.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    });
    const write = (event: unknown) => {
      if (!reply.raw.writableEnded) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    };
    try {
      await this.chats.send(user, body, write, abort.signal);
    } catch (error: any) {
      const status = error?.getStatus?.();
      write({
        type: 'error',
        code: status === 503 ? 'ai_unavailable' : 'chat_failed',
        message: error?.message ?? 'chat_failed',
        retryable: status === 503,
      });
    } finally {
      clearTimeout(timeout);
      reply.raw.end();
    }
  }
}
