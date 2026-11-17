import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql, SqlBool } from 'kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { User } from '@tcc-docs/db/types/entity.types';
import { isUserDisabled } from '../../common/helpers';
import { pageContentToMarkdown } from './page-markdown';

export const MAX_SEARCH_LIMIT = 10;
export const MAX_CONTEXT_PAGES = 20;
export const MAX_READ_CHARS = 60_000;

/**
 * Leituras expostas ao tcc-docs-ai pelo MCP. Todas recebem o usuário já
 * resolvido a partir da credencial delegada e filtram pelas mesmas regras de
 * acesso do app (`spaceMemberRepo` + `pagePermissionRepo`). Nenhuma escreve.
 */
@Injectable()
export class DocsReadService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly userRepo: UserRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  async resolveUser(userId: string, workspaceId: string): Promise<User | null> {
    const user = await this.userRepo.findById(userId, workspaceId);
    return user && !isUserDisabled(user) ? user : null;
  }

  private visiblePages(user: User) {
    return this.db
      .selectFrom('pages')
      .where('pages.workspaceId', '=', user.workspaceId)
      .where('pages.isBase', '=', false)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(user.id),
      )
      .where(this.pagePermissionRepo.accessiblePageCondition(user.id));
  }

  /**
   * Busca no texto ATUAL das páginas (não no índice vetorial). É o que permite
   * à IA descobrir páginas novas ou alteradas que o índice ainda não tem.
   * Usa `ILIKE` sem acento por palavra, para não depender da configuração de
   * idioma do `tsvector` do produto original (inglês).
   */
  async searchPages(user: User, query: string, limit = 5) {
    const words = [
      ...new Set(
        query
          .normalize('NFKD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .split(/[^a-z0-9]+/)
          .filter((word) => word.length > 3),
      ),
    ].slice(0, 12);
    if (!words.length) return [];

    const matches = words.map(
      (word) =>
        sql<number>`(f_unaccent(lower(coalesce(pages.title, '') || ' ' || coalesce(pages.text_content, ''))) like ${'%' + word + '%'})::int`,
    );
    const score = sql<number>`${sql.join(matches, sql` + `)}`;

    const rows = await this.visiblePages(user)
      .select([
        'pages.id',
        'pages.title',
        'pages.contentVersion',
        score.as('score'),
      ])
      .where('pages.deletedAt', 'is', null)
      .where(sql<SqlBool>`${score} > 0`)
      .orderBy('score', 'desc')
      .orderBy('pages.updatedAt', 'desc')
      .limit(Math.min(Math.max(limit, 1), MAX_SEARCH_LIMIT))
      .execute();

    return rows.map((row) => ({
      pageId: row.id,
      title: row.title ?? '',
      version: row.contentVersion,
    }));
  }

  /** Versão atual de cada página no app, para comparar com o índice. */
  async getPageContext(user: User, pageIds: string[]) {
    const ids = [...new Set(pageIds)]
      .filter((id) => /^[0-9a-f-]{36}$/i.test(id))
      .slice(0, MAX_CONTEXT_PAGES);
    if (!ids.length) return [];

    const rows = await this.visiblePages(user)
      .select([
        'pages.id',
        'pages.title',
        'pages.contentVersion',
        'pages.aiIndexedVersion',
        'pages.deletedAt',
        'pages.updatedAt',
      ])
      .where('pages.id', 'in', ids)
      .execute();

    return rows.map((row) => ({
      pageId: row.id,
      title: row.title ?? '',
      version: row.contentVersion,
      indexedVersion: row.aiIndexedVersion,
      deleted: Boolean(row.deletedAt),
      updatedAt: row.updatedAt,
    }));
  }

  /** "mcp-read": conteúdo atual da página em Markdown, com a versão. */
  async readPage(user: User, pageId: string) {
    if (!/^[0-9a-f-]{36}$/i.test(pageId)) return null;
    const row = await this.visiblePages(user)
      .select([
        'pages.id',
        'pages.title',
        'pages.contentVersion',
        'pages.content',
        'pages.deletedAt',
      ])
      .where('pages.id', '=', pageId)
      .executeTakeFirst();
    if (!row || row.deletedAt) return null;

    const markdown = pageContentToMarkdown(row.content);
    return {
      pageId: row.id,
      title: row.title ?? '',
      version: row.contentVersion,
      markdown: markdown.slice(0, MAX_READ_CHARS),
      truncated: markdown.length > MAX_READ_CHARS,
    };
  }
}
