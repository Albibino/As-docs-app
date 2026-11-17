import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { randomUUID } from 'node:crypto';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { User } from '@tcc-docs/db/types/entity.types';
import { EnvironmentService } from '../environment/environment.service';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { signAiRequest } from './ai-signing';
import { McpCredentialService } from './mcp-credential.service';
import { SseParser } from './sse-parser';

const CHAT_PATH = '/v1/chat/stream';
const HISTORY_TURNS = 10;
const MAX_QUESTION_CHARS = 4_000;

export type ChatClientEvent =
  | { type: 'chat_created'; chatId: string }
  | { type: 'freshness'; stalePages: StalePage[]; checked: boolean }
  | { type: 'sources'; sources: PageRef[] }
  | { type: 'content'; text: string }
  | { type: 'not_found'; similar: PageRef[] }
  | { type: 'done'; messageId: string; found: boolean; usage?: unknown }
  | { type: 'error'; message: string; code?: string; retryable?: boolean };

export interface PageRef {
  pageId: string;
  title: string;
  slugId?: string;
  spaceSlug?: string;
  n?: number;
  origin?: 'index' | 'mcp_read';
  version?: number;
}

export interface StalePage {
  pageId: string;
  title: string;
  indexedVersion: number | null;
  currentVersion: number;
}

export interface SendMessageInput {
  chatId?: string;
  content: string;
  contextPageId?: string;
}

/**
 * Conversa e "tirar dúvidas" sobre os documentos.
 *
 * O app não decide a resposta: valida, guarda a conversa, emite a credencial
 * MCP delegada (curta, somente leitura) e repassa a pergunta ao tcc-docs-ai.
 * O SSE do serviço de IA é traduzido para os eventos que o chat do cliente
 * consome. Fontes e páginas semelhantes são enriquecidas com o link da página,
 * sempre filtradas pelo que o usuário pode ver.
 */
@Injectable()
export class AiChatService {
  private readonly logger = new Logger(AiChatService.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environment: EnvironmentService,
    private readonly credentials: McpCredentialService,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  // --- conversas ------------------------------------------------------------

  async listChats(user: User, limit = 30) {
    const items = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('workspaceId', '=', user.workspaceId)
      .where('creatorId', '=', user.id)
      .where('deletedAt', 'is', null)
      .orderBy('updatedAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), 100))
      .execute();
    return {
      items,
      meta: {
        limit,
        hasNextPage: false,
        hasPrevPage: false,
        nextCursor: null,
        prevCursor: null,
      },
    };
  }

  async searchChats(user: User, query: string) {
    if (!query?.trim()) return [];
    return this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('workspaceId', '=', user.workspaceId)
      .where('creatorId', '=', user.id)
      .where('deletedAt', 'is', null)
      .where(sql<boolean>`coalesce(title, '') ilike ${'%' + query.trim() + '%'}`)
      .orderBy('updatedAt', 'desc')
      .limit(20)
      .execute();
  }

  async requireChat(user: User, chatId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(chatId ?? '')) {
      throw new NotFoundException('Chat not found');
    }
    const chat = await this.db
      .selectFrom('aiChats')
      .selectAll()
      .where('id', '=', chatId)
      .where('workspaceId', '=', user.workspaceId)
      .where('creatorId', '=', user.id)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!chat) throw new NotFoundException('Chat not found');
    return chat;
  }

  async getChatInfo(user: User, chatId: string) {
    const chat = await this.requireChat(user, chatId);
    const messages = await this.db
      .selectFrom('aiChatMessages')
      .select([
        'id',
        'chatId',
        'role',
        'content',
        'toolCalls',
        'metadata',
        'createdAt',
      ])
      .where('chatId', '=', chat.id)
      .where('deletedAt', 'is', null)
      .orderBy('createdAt', 'asc')
      .orderBy('id', 'asc')
      .execute();
    return { chat, messages };
  }

  async createChat(user: User, title?: string) {
    return this.db
      .insertInto('aiChats')
      .values({
        workspaceId: user.workspaceId,
        creatorId: user.id,
        title: title?.slice(0, 120) || null,
      })
      .returningAll()
      .executeTakeFirst();
  }

  async updateTitle(user: User, chatId: string, title: string) {
    await this.requireChat(user, chatId);
    await this.db
      .updateTable('aiChats')
      .set({ title: (title ?? '').trim().slice(0, 120) || null, updatedAt: new Date() })
      .where('id', '=', chatId)
      .execute();
  }

  async deleteChat(user: User, chatId: string) {
    await this.requireChat(user, chatId);
    await this.db
      .updateTable('aiChats')
      .set({ deletedAt: new Date() })
      .where('id', '=', chatId)
      .execute();
  }

  // --- pergunta -------------------------------------------------------------

  validate(input: SendMessageInput) {
    const content = input?.content?.trim();
    if (!content || content.length > MAX_QUESTION_CHARS) {
      throw new BadRequestException('Invalid question');
    }
    if (
      input.contextPageId !== undefined &&
      input.contextPageId !== null &&
      !/^[0-9a-f-]{36}$/i.test(input.contextPageId)
    ) {
      throw new BadRequestException('Invalid contextPageId');
    }
    return content;
  }

  /**
   * Executa uma pergunta e devolve os eventos para o cliente, um a um.
   * `emit` é chamado na ordem; erros do serviço de IA viram evento `error`.
   */
  async send(
    user: User,
    input: SendMessageInput,
    emit: (event: ChatClientEvent) => void,
    signal: AbortSignal,
  ): Promise<void> {
    const question = this.validate(input);
    if (!this.environment.isDocsAiConfigured()) {
      throw new ServiceUnavailableException('AI service is not configured');
    }

    const chat = input.chatId
      ? await this.requireChat(user, input.chatId)
      : await this.createChat(user, question.slice(0, 80));
    if (!input.chatId) emit({ type: 'chat_created', chatId: chat.id });

    const history = await this.history(chat.id);
    await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId: chat.id,
        workspaceId: user.workspaceId,
        userId: user.id,
        role: 'user',
        content: question,
        metadata: input.contextPageId
          ? JSON.stringify({ contextPageId: input.contextPageId })
          : null,
      })
      .execute();

    const body = JSON.stringify({
      tenantId: user.workspaceId,
      sessionId: chat.id,
      question,
      history,
      ...(input.contextPageId ? { contextPageId: input.contextPageId } : {}),
      ...(this.environment.isAiMcpEnabled()
        ? {
            mcpCredential: this.credentials.issue({
              userId: user.id,
              workspaceId: user.workspaceId,
              sessionId: chat.id,
            }),
          }
        : {}),
    });

    const state = {
      text: '',
      found: false,
      sources: [] as PageRef[],
      similar: [] as PageRef[],
      stalePages: [] as StalePage[],
      usage: undefined as unknown,
      error: undefined as undefined | { code?: string; message?: string },
    };

    let response: Response;
    try {
      response = await fetch(new URL(CHAT_PATH, this.environment.getDocsAiUrl()), {
        method: 'POST',
        headers: {
          ...signAiRequest({
            secret: this.environment.getDocsAiHmacSecret(),
            path: CHAT_PATH,
            body,
            idempotencyKey: randomUUID(),
          }),
          accept: 'text/event-stream',
        },
        body,
        signal,
      });
    } catch (error) {
      this.logger.warn(`tcc-docs-ai unreachable: ${(error as Error).message}`);
      emit({ type: 'error', code: 'ai_unavailable', message: 'ai_unavailable', retryable: true });
      return;
    }
    if (!response.ok || !response.body) {
      const code = await this.upstreamErrorCode(response);
      emit({ type: 'error', code, message: code, retryable: response.status >= 500 });
      return;
    }

    const parser = new SseParser();
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      for (const event of parser.push(decoder.decode(value, { stream: true }))) {
        await this.handleUpstream(user, event, state, emit);
      }
    }

    if (state.error) {
      emit({
        type: 'error',
        code: state.error.code,
        message: state.error.code ?? 'ai_error',
        retryable: false,
      });
      return;
    }

    const message = await this.db
      .insertInto('aiChatMessages')
      .values({
        chatId: chat.id,
        workspaceId: user.workspaceId,
        userId: null,
        role: 'assistant',
        content: state.found ? state.text : null,
        metadata: JSON.stringify({
          found: state.found,
          sources: state.sources,
          similar: state.similar,
          stalePages: state.stalePages,
          ...(state.usage ? { tokenUsage: state.usage } : {}),
        }),
      })
      .returning('id')
      .executeTakeFirst();
    await this.db
      .updateTable('aiChats')
      .set({ updatedAt: new Date() })
      .where('id', '=', chat.id)
      .execute();

    emit({ type: 'done', messageId: message.id, found: state.found, usage: state.usage });
  }

  private async handleUpstream(
    user: User,
    event: { event: string; data: string },
    state: any,
    emit: (event: ChatClientEvent) => void,
  ) {
    let data: any;
    try {
      data = JSON.parse(event.data);
    } catch {
      return;
    }
    switch (event.event) {
      case 'meta': {
        state.stalePages = data.stalePages ?? [];
        emit({
          type: 'freshness',
          stalePages: state.stalePages,
          checked: Boolean(data.freshnessChecked),
        });
        break;
      }
      case 'sources': {
        state.sources = await this.enrich(user, data);
        emit({ type: 'sources', sources: state.sources });
        break;
      }
      case 'delta': {
        state.text += data.text ?? '';
        emit({ type: 'content', text: data.text ?? '' });
        break;
      }
      case 'not_found': {
        state.similar = await this.enrich(user, data.similar ?? []);
        emit({ type: 'not_found', similar: state.similar });
        break;
      }
      case 'usage':
        state.usage = data;
        break;
      case 'done':
        state.found = Boolean(data.found);
        break;
      case 'error':
        state.error = data;
        break;
    }
  }

  /** Adiciona slug/space às páginas citadas, descartando as que o usuário não vê. */
  async enrich(user: User, refs: PageRef[]): Promise<PageRef[]> {
    const ids = [...new Set(refs.map((ref) => ref.pageId))].filter((id) =>
      /^[0-9a-f-]{36}$/i.test(id),
    );
    if (!ids.length) return [];
    const visible = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: ids,
        userId: user.id,
      }),
    );
    const rows = await this.db
      .selectFrom('pages')
      .innerJoin('spaces', 'spaces.id', 'pages.spaceId')
      .select(['pages.id', 'pages.slugId', 'pages.title', 'spaces.slug'])
      .where('pages.id', 'in', ids)
      .where('pages.workspaceId', '=', user.workspaceId)
      .where('pages.deletedAt', 'is', null)
      .execute();
    const byId = new Map(rows.map((row) => [row.id, row]));
    return refs
      .filter((ref) => visible.has(ref.pageId) && byId.has(ref.pageId))
      .map((ref) => {
        const row = byId.get(ref.pageId)!;
        return {
          ...ref,
          title: row.title || ref.title,
          slugId: row.slugId,
          spaceSlug: row.slug,
        };
      });
  }

  private async history(chatId: string) {
    const rows = await this.db
      .selectFrom('aiChatMessages')
      .select(['role', 'content'])
      .where('chatId', '=', chatId)
      .where('deletedAt', 'is', null)
      .where('content', 'is not', null)
      .where('role', 'in', ['user', 'assistant'])
      .orderBy('createdAt', 'desc')
      .limit(HISTORY_TURNS)
      .execute();
    return rows
      .reverse()
      .filter((row) => row.content?.trim())
      .map((row) => ({ role: row.role, content: row.content }));
  }

  private async upstreamErrorCode(response: Response) {
    try {
      const payload = (await response.json()) as { error?: { code?: string } };
      return payload?.error?.code ?? `http_${response.status}`;
    } catch {
      return `http_${response.status}`;
    }
  }
}
