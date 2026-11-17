import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { EnvironmentService } from '../environment/environment.service';
import { signAiRequest } from './ai-signing';
import { pageContentToMarkdown } from './page-markdown';

const INDEX_PATH = '/v1/index/pages';
const BATCH_SIZE = 20;

export interface PendingPage {
  id: string;
  workspaceId: string;
  spaceId: string;
  title: string | null;
  content: unknown;
  contentVersion: number;
  deletedAt: Date | null;
}

export interface IndexResult {
  pageId: string;
  version: number;
  status: 'indexed' | 'already_indexed' | 'older_than_latest';
}

/**
 * Envia ao tcc-docs-ai as versões de página que ainda não estão no índice.
 *
 * - "Pendente" é `ai_indexed_version < content_version` (índice parcial).
 * - Só a versão ATUAL é enviada; o serviço de IA nunca reindexa uma versão que
 *   já tem e ignora versões menores que a maior conhecida.
 * - O marcador só avança depois da confirmação, e só para cima (`GREATEST`),
 *   então reenvio é seguro e uma corrida com nova edição nunca regride.
 * - Roda num intervalo (`DOCS_AI_INDEX_INTERVAL_SECONDS`, padrão 30 s). Nesse
 *   intervalo o índice fica atrás do app — é a janela que o chat cobre lendo
 *   a página pelo MCP.
 */
@Injectable()
export class AiIndexingService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AiIndexingService.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly environment: EnvironmentService,
  ) {}

  onApplicationBootstrap() {
    const seconds = this.environment.getAiIndexIntervalSeconds();
    if (!this.environment.isDocsAiConfigured() || !(seconds > 0)) return;
    this.timer = setInterval(() => void this.runOnce(), seconds * 1000);
    this.timer.unref?.();
  }

  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  async findPending(limit = BATCH_SIZE, workspaceId?: string) {
    return (await this.db
      .selectFrom('pages')
      .select([
        'id',
        'workspaceId',
        'spaceId',
        'title',
        'content',
        'contentVersion',
        'deletedAt',
      ])
      .where('isBase', '=', false)
      .where(sql<boolean>`ai_indexed_version < content_version`)
      .$if(Boolean(workspaceId), (qb) =>
        qb.where('workspaceId', '=', workspaceId),
      )
      .orderBy('updatedAt', 'asc')
      .limit(limit)
      .execute()) as PendingPage[];
  }

  toIndexPayload(page: PendingPage) {
    const deleted = Boolean(page.deletedAt);
    return {
      pageId: page.id,
      version: page.contentVersion,
      title: page.title ?? '',
      spaceId: page.spaceId,
      text: deleted ? '' : pageContentToMarkdown(page.content),
      deleted,
    };
  }

  /** Um ciclo: indexa até um lote por workspace. Devolve quantas confirmou. */
  async runOnce(): Promise<number> {
    if (this.running || !this.environment.isDocsAiConfigured()) return 0;
    this.running = true;
    try {
      const pending = await this.findPending();
      const byWorkspace = new Map<string, PendingPage[]>();
      for (const page of pending) {
        const list = byWorkspace.get(page.workspaceId) ?? [];
        list.push(page);
        byWorkspace.set(page.workspaceId, list);
      }
      let confirmed = 0;
      for (const [workspaceId, pages] of byWorkspace) {
        confirmed += await this.indexPages(workspaceId, pages);
      }
      return confirmed;
    } catch (error) {
      this.logger.warn(
        `AI indexing cycle failed: ${error instanceof Error ? error.message : error}`,
      );
      return 0;
    } finally {
      this.running = false;
    }
  }

  async indexPages(workspaceId: string, pages: PendingPage[]): Promise<number> {
    if (!pages.length) return 0;
    const body = JSON.stringify({
      tenantId: workspaceId,
      pages: pages.map((page) => this.toIndexPayload(page)),
    });
    const response = await fetch(
      new URL(INDEX_PATH, this.environment.getDocsAiUrl()),
      {
        method: 'POST',
        headers: signAiRequest({
          secret: this.environment.getDocsAiHmacSecret(),
          path: INDEX_PATH,
          body,
        }),
        body,
      },
    );
    if (!response.ok) {
      throw new Error(`tcc-docs-ai index responded ${response.status}`);
    }
    const { results } = (await response.json()) as { results: IndexResult[] };
    await this.markIndexed(results);
    return results.length;
  }

  /** Marca como indexada a versão confirmada — só para cima. */
  async markIndexed(results: IndexResult[]) {
    for (const result of results) {
      await sql`
        UPDATE pages
        SET ai_indexed_version = GREATEST(ai_indexed_version, ${result.version})
        WHERE id = ${result.pageId}
      `.execute(this.db);
    }
  }
}
