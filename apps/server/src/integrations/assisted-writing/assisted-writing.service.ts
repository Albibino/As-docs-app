import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { EnvironmentService } from '../environment/environment.service';
import { PageHistoryRepo } from '@tcc-docs/db/repos/page/page-history.repo';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { sql } from 'kysely';
import type { Page, User } from '@tcc-docs/db/types/entity.types';
import { Transform } from 'node:stream';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import type {
  AssistedWritingInput,
  AssistedWritingVersionInput,
  SAiGenerationRequest,
  SpacePageRef,
} from './assisted-writing.types';

const GENERATION_PATH = '/v1/generations/stream';
// The input token budget is enforced upstream by the AI service, which counts the final
// payload. These two caps stay because they bound the query and a single title,
// not the token spend.
const SPACE_PAGE_INDEX_LIMIT = 200;
const SPACE_PAGE_TITLE_LIMIT = 200;
// Mirror of EDITABLE_BLOCK_TYPES in
// apps/client/src/features/assisted-writing/domain/assisted-writing.ts. The client sends
// editable: true for these types; anything missing here rejects the request.
const EDITABLE_BLOCK_TYPES = new Set([
  'paragraph',
  'heading',
  'bulletList',
  'orderedList',
  'taskList',
  'table',
]);

@Injectable()
export class AssistedWritingService {
  private readonly logger = new Logger(AssistedWritingService.name);

  constructor(
    private readonly environment: EnvironmentService,
    private readonly pageHistoryRepo: PageHistoryRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  /**
   * Titles of the pages in a space the user may link to, most recently updated
   * first. Built server-side and never accepted from the client: it is the only
   * way the model learns a real pageId, so it must not be spoofable.
   */
  async listSpacePageIndex(options: {
    spaceId: string;
    workspaceId: string;
    userId: string;
    excludePageId: string;
  }): Promise<SpacePageRef[]> {
    const pages = await this.db
      .selectFrom('pages')
      .select(['id', 'slugId', 'title'])
      .where('spaceId', '=', options.spaceId)
      .where('workspaceId', '=', options.workspaceId)
      .where('id', '!=', options.excludePageId)
      .where('deletedAt', 'is', null)
      .where('title', 'is not', null)
      .where('title', '!=', '')
      .orderBy('updatedAt', 'desc')
      .limit(SPACE_PAGE_INDEX_LIMIT)
      .execute();
    if (!pages.length) return [];

    const accessibleIds = new Set(
      await this.pagePermissionRepo.filterAccessiblePageIds({
        pageIds: pages.map((page) => page.id),
        userId: options.userId,
        spaceId: options.spaceId,
      }),
    );
    const index: SpacePageRef[] = [];
    for (const page of pages) {
      if (!accessibleIds.has(page.id)) continue;
      index.push({
        pageId: page.id,
        slugId: page.slugId,
        title: page.title.slice(0, SPACE_PAGE_TITLE_LIMIT),
      });
    }
    return index;
  }

  validateInput(input: AssistedWritingInput): void {
    if (!input || typeof input !== 'object') throw new BadRequestException();
    if (!input.pageId || typeof input.pageId !== 'string') {
      throw new BadRequestException('pageId is required');
    }
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.sessionId)) {
      throw new BadRequestException('sessionId must be a UUID');
    }
    if (!input.request?.trim() || input.request.length > 10_000) {
      throw new BadRequestException('Invalid request');
    }
    if (!Array.isArray(input.blocks) || input.blocks.length > 20_000) {
      throw new BadRequestException('Invalid blocks');
    }
    for (const block of input.blocks) {
      if (
        !block?.blockId ||
        !block.type ||
        !/^[0-9a-f]{64}$/i.test(block.hash) ||
        typeof block.editable !== 'boolean' ||
        (block.editable && !EDITABLE_BLOCK_TYPES.has(block.type)) ||
        (!block.editable &&
          block.content !== undefined &&
          block.type !== 'heading' &&
          block.type !== 'omitted')
      ) {
        throw new BadRequestException('Invalid block');
      }
    }
    const blockIds = new Set(input.blocks.map((block) => block.blockId));
    if (
      input.selectedBlockIds &&
      (!Array.isArray(input.selectedBlockIds) ||
        input.selectedBlockIds.length > input.blocks.length ||
        input.selectedBlockIds.some(
          (blockId) => typeof blockId !== 'string' || !blockIds.has(blockId),
        ))
    ) {
      throw new BadRequestException('Invalid selectedBlockIds');
    }
    if (
      input.history &&
      (!Array.isArray(input.history) ||
        input.history.length > 50 ||
        input.history.some(
          (message) =>
            !['user', 'assistant'].includes(message?.role) ||
            typeof message.content !== 'string' ||
            message.content.length > 100_000,
        ))
    ) {
      throw new BadRequestException('Invalid history');
    }
    if (
      input.partialContext !== undefined &&
      typeof input.partialContext !== 'boolean'
    ) {
      throw new BadRequestException('Invalid partialContext');
    }
    if (
      input.title !== undefined &&
      (typeof input.title !== 'string' || input.title.length > 500)
    ) {
      throw new BadRequestException('Invalid title');
    }
    const isLabelArray = (value: unknown): value is string[] =>
      Array.isArray(value) &&
      value.length <= 200 &&
      value.every((label) => typeof label === 'string' && label.length <= 100);
    if (input.labels !== undefined && !isLabelArray(input.labels)) {
      throw new BadRequestException('Invalid labels');
    }
    if (
      input.availableLabels !== undefined &&
      !isLabelArray(input.availableLabels)
    ) {
      throw new BadRequestException('Invalid availableLabels');
    }
    // The page index is built server-side from the user's own permissions.
    // A client-supplied one would let the model link to pages the user cannot see.
    if ('spacePages' in (input as unknown as Record<string, unknown>)) {
      throw new BadRequestException('spacePages is not accepted from clients');
    }
  }

  buildSignedRequest(
    input: AssistedWritingInput,
    tenantId: string,
    spacePages: SpacePageRef[] = [],
  ) {
    if (!this.environment.isDocsAiConfigured()) {
      throw new ServiceUnavailableException('AI service is not configured');
    }
    const payload: SAiGenerationRequest = {
      tenantId,
      sessionId: input.sessionId,
      request: input.request.trim(),
      blocks: input.blocks,
      ...(input.selectedBlockIds?.length
        ? { selectedBlockIds: input.selectedBlockIds }
        : {}),
      ...(input.history?.length ? { history: input.history } : {}),
      ...(input.partialContext ? { partialContext: true } : {}),
      ...(input.title ? { title: input.title } : {}),
      ...(input.labels?.length ? { labels: input.labels } : {}),
      ...(input.availableLabels?.length
        ? { availableLabels: input.availableLabels }
        : {}),
      // Upstream gets no slugId: the model never needs it and every entry is
      // charged against the same authoritative input token budget as the page.
      ...(spacePages.length
        ? {
            spacePages: spacePages.map((page) => ({
              pageId: page.pageId,
              title: page.title,
            })),
          }
        : {}),
    };
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const idempotencyKey = randomUUID();
    const bodyHash = createHash('sha256').update(body).digest('hex');
    const canonical = [
      timestamp,
      'POST',
      GENERATION_PATH,
      idempotencyKey,
      bodyHash,
    ].join('\n');
    const signature = createHmac(
      'sha256',
      this.environment.getDocsAiHmacSecret(),
    )
      .update(canonical)
      .digest('hex');
    const url = new URL(GENERATION_PATH, this.environment.getDocsAiUrl());
    return {
      url,
      body,
      idempotencyKey,
      headers: {
        'content-type': 'application/json',
        accept: 'text/event-stream',
        'x-ai-consumer': 'docs-app',
        'x-ai-timestamp': timestamp,
        'idempotency-key': idempotencyKey,
        'x-ai-signature': `v1=${signature}`,
      },
    };
  }

  async openStream(
    input: AssistedWritingInput,
    tenantId: string,
    signal: AbortSignal,
    spacePages: SpacePageRef[] = [],
  ): Promise<Response> {
    this.validateInput(input);
    const signed = this.buildSignedRequest(input, tenantId, spacePages);
    const startedAt = Date.now();
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const response = await fetch(signed.url, {
          method: 'POST',
          headers: signed.headers,
          body: signed.body,
          signal,
        });
        this.logger.log({
          event: 's_ai_stream_opened',
          tenantId,
          latencyMs: Date.now() - startedAt,
          status: response.status,
          attempt,
        });
        return response;
      } catch (error) {
        lastError = error;
        if (signal.aborted) throw error;
        // fetch rejected before response headers: zero upstream bytes observed.
        if (attempt === 0) continue;
      }
    }
    this.logger.error({
      event: 's_ai_connection_failed',
      tenantId,
      latencyMs: Date.now() - startedAt,
    });
    throw new BadGatewayException(
      lastError instanceof Error ? lastError.message : 'AI service unavailable',
    );
  }

  createMetricsTransform(tenantId: string, startedAt: number): Transform {
    let lineBuffer = '';
    let discardLongLine = false;
    let eventName = '';
    let inputTokens: number | undefined;
    let cachedInputTokens: number | undefined;
    let outputTokens: number | undefined;
    const logger = this.logger;
    return new Transform({
      transform(chunk, _encoding, callback) {
        const text = chunk.toString('utf8');
        for (const character of text) {
          if (character === '\n') {
            if (!discardLongLine) {
              const line = lineBuffer.replace(/\r$/, '');
              if (line.startsWith('event:')) eventName = line.slice(6).trim();
              if (
                line.startsWith('data:') &&
                ['meta', 'usage'].includes(eventName)
              ) {
                try {
                  const value = JSON.parse(line.slice(5).trim());
                  inputTokens = value.inputTokens ?? inputTokens;
                  cachedInputTokens =
                    value.cachedInputTokens ?? cachedInputTokens;
                  outputTokens = value.outputTokens ?? outputTokens;
                } catch {
                  /* malformed metrics never affect stream */
                }
              }
            }
            lineBuffer = '';
            discardLongLine = false;
          } else if (!discardLongLine) {
            if (lineBuffer.length < 8_192) lineBuffer += character;
            else {
              lineBuffer = '';
              discardLongLine = true;
            }
          }
        }
        callback(null, chunk);
      },
      flush(callback) {
        logger.log({
          event: 's_ai_stream_completed',
          tenantId,
          latencyMs: Date.now() - startedAt,
          inputTokens,
          cachedInputTokens,
          outputTokens,
          cacheHit: (cachedInputTokens ?? 0) > 0,
        });
        callback();
      },
    });
  }

  async recordReferenceVersion(
    input: AssistedWritingVersionInput,
    page: Page,
    user: User,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(input.sessionId)) {
      throw new BadRequestException('sessionId must be a UUID');
    }
    if (!input.content || !Array.isArray(input.operations)) {
      throw new BadRequestException('Invalid application metadata');
    }
    const history = await this.pageHistoryRepo.insertPageHistory({
      pageId: page.id,
      slugId: page.slugId,
      title: page.title,
      content: input.content as any,
      icon: page.icon,
      coverPhoto: page.coverPhoto,
      lastUpdatedById: user.id,
      contributorIds: [user.id],
      spaceId: page.spaceId,
      workspaceId: page.workspaceId,
      kind: 'automatic',
    });
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const result = await sql<{ id: string }>`
      INSERT INTO ai_assisted_writing_applications
        (workspace_id, page_id, page_history_id, user_id, session_id,
         operations, before_hashes, after_hashes, expires_at)
      VALUES
        (${page.workspaceId}, ${page.id}, ${history.id}, ${user.id},
         ${input.sessionId}::uuid, ${JSON.stringify(input.operations)}::jsonb,
         ${JSON.stringify(input.beforeHashes)}::jsonb,
         ${JSON.stringify(input.afterHashes)}::jsonb, ${expiresAt})
      RETURNING id
    `.execute(this.db);
    return {
      applicationId: result.rows[0].id,
      versionId: history.id,
      expiresAt: expiresAt.toISOString(),
    };
  }

  async endSession(
    sessionId: string,
    pageId: string,
    workspaceId: string,
    userId: string,
  ) {
    if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(sessionId)) {
      throw new BadRequestException('sessionId must be a UUID');
    }
    await sql`
      UPDATE ai_assisted_writing_applications
      SET ended_at = now()
      WHERE workspace_id = ${workspaceId}
        AND page_id = ${pageId}
        AND user_id = ${userId}
        AND session_id = ${sessionId}::uuid
        AND ended_at IS NULL
    `.execute(this.db);
  }
}
