import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import {
  InsertablePageAccess,
  InsertablePagePermission,
  PageAccess,
  PagePermission,
} from '@tcc-docs/db/types/entity.types';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { RawBuilder, sql, SqlBool } from 'kysely';
import {
  CursorPaginationResult,
  executeWithCursorPagination,
} from '@tcc-docs/db/pagination/cursor-pagination';
import { PagePermissionMember } from './types/page-permission.types';

export { PagePermissionMember } from './types/page-permission.types';

type EffectivePermissionRow = {
  pageAccessId: string;
  accessMode: string;
  depth: number;
  userId: string | null;
  teamId: string | null;
  workspaceWide: boolean;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  teamMatches: boolean;
};

type EffectivePermission = {
  hasRestriction: boolean;
  blocked: boolean;
  permission?: { canView: boolean; canEdit: boolean; canDelete: boolean };
};

/**
 * Resolves page ACLs from the closest page to its ancestors. A matching rule
 * on a child always takes precedence over inherited rules, while a restricted
 * page without a matching view rule blocks the inheritance chain.
 */
export function resolveEffectivePermission(
  rows: EffectivePermissionRow[],
  userId: string,
): EffectivePermission {
  const groups = new Map<string, EffectivePermissionRow[]>();
  for (const row of rows) {
    const accessRows = groups.get(row.pageAccessId) ?? [];
    accessRows.push(row);
    groups.set(row.pageAccessId, accessRows);
  }

  const pick = (accessRows: EffectivePermissionRow[]) => {
    const user = accessRows.find((row) => row.userId === userId);
    if (user) return user;
    const teams = accessRows.filter((row) => row.teamId && row.teamMatches);
    if (teams.length) {
      return {
        canView: teams.some((row) => row.canView),
        canEdit: teams.some((row) => row.canEdit),
        canDelete: teams.some((row) => row.canDelete),
      };
    }
    return accessRows.find((row) => row.workspaceWide);
  };

  const ordered = [...groups.values()].sort(
    (left, right) => left[0].depth - right[0].depth,
  );
  for (const accessRows of ordered) {
    const match = pick(accessRows);
    if (accessRows[0].accessMode === 'restricted') {
      if (!match || !match.canView) {
        return { hasRestriction: true, blocked: true };
      }
      return {
        hasRestriction: true,
        blocked: false,
        permission: {
          canView: match.canView,
          canEdit: match.canEdit,
          canDelete: match.canDelete,
        },
      };
    }
    if (match) {
      return {
        hasRestriction: false,
        blocked: !match.canView,
        permission: {
          canView: match.canView,
          canEdit: match.canEdit,
          canDelete: match.canDelete,
        },
      };
    }
  }

  return { hasRestriction: false, blocked: false };
}

@Injectable()
export class PagePermissionRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findPageAccessByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<PageAccess | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pageAccess')
      .selectAll()
      .where('pageId', '=', pageId)
      .executeTakeFirst();
  }

  async insertPageAccess(
    data: InsertablePageAccess,
    trx?: KyselyTransaction,
  ): Promise<PageAccess> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('pageAccess')
      .values(data)
      .returningAll()
      .executeTakeFirst();
  }

  async deletePageAccess(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db.deleteFrom('pageAccess').where('pageId', '=', pageId).execute();
  }

  async insertPagePermissions(
    permissions: InsertablePagePermission[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (permissions.length === 0) return;
    const db = dbOrTx(this.db, trx);
    await db.insertInto('pagePermissions').values(permissions).execute();
  }

  async findPagePermissionById(
    pageAccessId: string,
    permissionId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePermission | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pagePermissions')
      .selectAll()
      .where('pageAccessId', '=', pageAccessId)
      .where('id', '=', permissionId)
      .executeTakeFirst();
  }

  async deletePagePermissionsByIds(
    pageAccessId: string,
    permissionIds: string[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (!permissionIds.length) return;
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('pagePermissions')
      .where('pageAccessId', '=', pageAccessId)
      .where('id', 'in', permissionIds)
      .execute();
  }

  async updatePagePermission(
    pageAccessId: string,
    permissionId: string,
    data: Partial<
      Pick<
        PagePermission,
        'canView' | 'canEdit' | 'canDelete' | 'includeSubpages'
      >
    >,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('pagePermissions')
      .set({ ...data, updatedAt: new Date() })
      .where('pageAccessId', '=', pageAccessId)
      .where('id', '=', permissionId)
      .execute();
  }

  async findPagePermissions(
    pageAccessId: string,
    userIds?: string[],
    trx?: KyselyTransaction,
  ): Promise<PagePermission[]> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('pagePermissions')
      .selectAll()
      .where('pageAccessId', '=', pageAccessId);

    if (userIds && userIds.length > 0) {
      query = query.where('userId', 'in', userIds);
    }

    return query.execute();
  }

  async findPagePermissionByUserId(
    pageAccessId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<PagePermission | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('pagePermissions')
      .selectAll()
      .where('pageAccessId', '=', pageAccessId)
      .where('userId', '=', userId)
      .executeTakeFirst();
  }

  async deletePagePermissionByUserId(
    pageAccessId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('pagePermissions')
      .where('pageAccessId', '=', pageAccessId)
      .where('userId', '=', userId)
      .execute();
  }

  async deletePagePermissionsByUserIds(
    pageAccessId: string,
    userIds: string[],
    trx?: KyselyTransaction,
  ): Promise<void> {
    if (userIds.length === 0) return;
    const db = dbOrTx(this.db, trx);
    await db
      .deleteFrom('pagePermissions')
      .where('pageAccessId', '=', pageAccessId)
      .where('userId', 'in', userIds)
      .execute();
  }

  async updatePagePermissionRole(
    pageAccessId: string,
    role: string,
    opts: { userId: string },
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .updateTable('pagePermissions')
      .set({ role, updatedAt: new Date() })
      .where('pageAccessId', '=', pageAccessId);

    query = query.where('userId', '=', opts.userId);

    await query.execute();
  }

  async countWritersByPageAccessId(
    pageAccessId: string,
    opts?: { trx?: KyselyTransaction },
  ): Promise<number> {
    const db = dbOrTx(this.db, opts?.trx);
    const result = await db
      .selectFrom('pagePermissions')
      .select((eb) => eb.fn.count('id').as('count'))
      .where('pageAccessId', '=', pageAccessId)
      .where('role', '=', 'writer')
      .executeTakeFirst();
    return Number(result?.count ?? 0);
  }

  async getPagePermissionsPaginated(
    pageAccessId: string,
    pagination: PaginationOptions,
  ): Promise<CursorPaginationResult<PagePermissionMember>> {
    let baseQuery = this.db
      .selectFrom('pagePermissions')
      .innerJoin('pageAccess', 'pageAccess.id', 'pagePermissions.pageAccessId')
      .leftJoin('users', 'users.id', 'pagePermissions.userId')
      .leftJoin('teams', 'teams.id', 'pagePermissions.teamId')
      .select([
        'pagePermissions.id',
        'pagePermissions.createdAt',
        'pagePermissions.canView',
        'pagePermissions.canEdit',
        'pagePermissions.canDelete',
        'pagePermissions.includeSubpages',
        'pagePermissions.workspaceWide',
        'pagePermissions.userId',
        'pagePermissions.teamId',
        'users.name as userName',
        'users.avatarUrl as userAvatarUrl',
        'users.email as userEmail',
        'teams.name as teamName',
      ])
      .where('pagePermissions.pageAccessId', '=', pageAccessId);

    if (pagination.query) {
      baseQuery = baseQuery.where((eb) =>
        eb(
          sql`f_unaccent(coalesce(users.name, teams.name, 'Workspace'))`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ).or(
          sql`coalesce(users.email, teams.name, 'Workspace')`,
          'ilike',
          sql`f_unaccent(${'%' + pagination.query + '%'})`,
        ),
      );
    }

    const query = this.db.selectFrom(baseQuery.as('sub')).selectAll('sub');
    const result = await executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'sub.id', direction: 'asc', key: 'id' }],
      parseCursor: (cursor) => ({
        id: cursor.id,
      }),
    });

    const items: PagePermissionMember[] = result.items.map((member) => ({
      id: member.id,
      name: member.workspaceWide
        ? 'Workspace'
        : (member.userName ?? member.teamName ?? ''),
      ...(member.userId
        ? {
            email: member.userEmail ?? '',
            avatarUrl: member.userAvatarUrl,
            type: 'user' as const,
          }
        : member.teamId
          ? { type: 'team' as const }
          : { type: 'workspace' as const }),
      canView: member.canView,
      canEdit: member.canEdit,
      canDelete: member.canDelete,
      includeSubpages: member.includeSubpages,
      createdAt: member.createdAt,
    }));

    return { items, meta: result.meta };
  }

  /**
   * Resolves only page-level rules. Callers combine an undefined rule with
   * the Space ACL. Restricted ancestors are hard boundaries; shared rules are
   * overlays and the closest matching rule wins.
   */
  async getEffectivePermission(
    userId: string,
    pageId: string,
  ): Promise<{
    hasRestriction: boolean;
    blocked: boolean;
    permission?: { canView: boolean; canEdit: boolean; canDelete: boolean };
  }> {
    const result = await sql<{
      pageAccessId: string;
      accessMode: string;
      depth: number;
      userId: string | null;
      teamId: string | null;
      workspaceWide: boolean;
      canView: boolean;
      canEdit: boolean;
      canDelete: boolean;
      teamMatches: boolean;
    }>`
      WITH RECURSIVE ancestors AS (
        SELECT id AS ancestor_id, parent_page_id, 0 AS depth
        FROM pages WHERE id = ${pageId}::uuid
        UNION ALL
        SELECT p.id, p.parent_page_id, a.depth + 1
        FROM pages p JOIN ancestors a ON a.parent_page_id = p.id
      )
      SELECT pa.id AS "pageAccessId", pa.access_mode AS "accessMode", a.depth,
             pp.user_id AS "userId", pp.team_id AS "teamId",
             pp.workspace_wide AS "workspaceWide", pp.can_view AS "canView",
             pp.can_edit AS "canEdit", pp.can_delete AS "canDelete",
             EXISTS (
               SELECT 1 FROM team_members tm
               WHERE tm.team_id = pp.team_id AND tm.user_id = ${userId}::uuid
             ) AS "teamMatches"
      FROM ancestors a
      JOIN page_access pa ON pa.page_id = a.ancestor_id
      LEFT JOIN page_permissions pp
        ON pp.page_access_id = pa.id
       AND (a.depth = 0 OR pp.include_subpages = true)
      ORDER BY a.depth ASC, pp.created_at ASC
    `.execute(this.db);

    return resolveEffectivePermission(result.rows, userId);
  }

  async hasSharedPermissionForSpace(
    userId: string,
    spaceId: string,
  ): Promise<boolean> {
    const result = await sql<{ allowed: boolean }>`
      SELECT EXISTS (
        SELECT 1
        FROM pages page
        JOIN page_access access ON access.page_id = page.id
        JOIN page_permissions permission ON permission.page_access_id = access.id
        WHERE page.space_id = ${spaceId}::uuid
          AND page.deleted_at IS NULL
          AND permission.can_view = true
          AND (
            permission.user_id = ${userId}::uuid
            OR permission.workspace_wide = true
            OR EXISTS (
              SELECT 1 FROM team_members target_team
              WHERE target_team.team_id = permission.team_id
                AND target_team.user_id = ${userId}::uuid
            )
          )
      ) AS allowed
    `.execute(this.db);
    return Boolean(result.rows[0]?.allowed);
  }

  async getUserPagePermission(
    userId: string,
    pageId: string,
  ): Promise<{ role: string } | undefined> {
    const result = await this.db
      .selectFrom('pageAccess')
      .innerJoin(
        'pagePermissions',
        'pagePermissions.pageAccessId',
        'pageAccess.id',
      )
      .select(['pagePermissions.role'])
      .where('pageAccess.pageId', '=', pageId)
      .where('pagePermissions.userId', '=', userId)
      .executeTakeFirst();

    return result;
  }

  async findRestrictedAncestor(
    pageId: string,
    opts?: { excludeSelf?: boolean },
  ): Promise<
    | {
        pageAccessId: string;
        pageId: string;
        accessLevel: string;
        depth: number;
      }
    | undefined
  > {
    let query = this.db
      .withRecursive('ancestors', (qb) =>
        qb
          .selectFrom('pages')
          .select([
            'pages.id as ancestorId',
            'pages.parentPageId',
            sql<number>`0`.as('depth'),
          ])
          .where('pages.id', '=', pageId)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin('ancestors', 'ancestors.parentPageId', 'pages.id')
              .select([
                'pages.id as ancestorId',
                'pages.parentPageId',
                sql<number>`ancestors.depth + 1`.as('depth'),
              ]),
          ),
      )
      .selectFrom('ancestors')
      .innerJoin('pageAccess', 'pageAccess.pageId', 'ancestors.ancestorId')
      .select([
        'pageAccess.id as pageAccessId',
        'pageAccess.pageId',
        'pageAccess.accessLevel',
        'ancestors.depth',
      ])
      .where('pageAccess.accessMode', '=', 'restricted')
      .orderBy('ancestors.depth', 'asc');

    if (opts?.excludeSelf) {
      query = query.where('ancestors.depth', '>', 0);
    }

    return query.executeTakeFirst();
  }

  /**
   * Check if user can access a page by verifying they have permission on ALL restricted ancestors.
   */
  async canUserAccessPage(userId: string, pageId: string): Promise<boolean> {
    const { canAccess } = await this.canUserEditPage(userId, pageId);
    return canAccess;
  }

  /**
   * Check if user can edit a page.
   * Single query: builds ancestor chain once, checks both traversal and nearest-restricted writer.
   * - bool_and(pp.id IS NOT NULL): false if any restricted ancestor has no permission (traversal denied)
   * - array_agg(role ORDER BY depth)[1]: role on the nearest restricted ancestor
   * - Zero rows (no restricted ancestors): both NULL → defer to space permissions (true)
   */
  async canUserEditPage(
    userId: string,
    pageId: string,
  ): Promise<{
    hasAnyRestriction: boolean;
    canAccess: boolean;
    canEdit: boolean;
  }> {
    const access = await this.getEffectivePermission(userId, pageId);
    return {
      hasAnyRestriction: access.hasRestriction,
      canAccess: !access.blocked,
      canEdit: access.permission?.canEdit ?? !access.blocked,
    };
  }

  /**
   * Get user's access level for a page.
   * Returns:
   * - hasDirectRestriction: whether this specific page has restrictions
   * - hasInheritedRestriction: whether any ancestor (not self) has restrictions
   * - hasAnyRestriction: hasDirectRestriction || hasInheritedRestriction
   * - canAccess: user has permission on all restricted ancestors (always true if no restrictions)
   * - canEdit: user has writer on nearest restricted ancestor (always true if no restrictions)
   */
  async getUserPageAccessLevel(
    userId: string,
    pageId: string,
  ): Promise<{
    hasDirectRestriction: boolean;
    hasInheritedRestriction: boolean;
    hasAnyRestriction: boolean;
    canAccess: boolean;
    canEdit: boolean;
  }> {
    const result = await this.db
      .withRecursive('ancestors', (qb) =>
        qb
          .selectFrom('pages')
          .select([
            'pages.id as ancestorId',
            'pages.parentPageId',
            sql<number>`0`.as('depth'),
          ])
          .where('pages.id', '=', pageId)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin('ancestors', 'ancestors.parentPageId', 'pages.id')
              .select([
                'pages.id as ancestorId',
                'pages.parentPageId',
                sql<number>`ancestors.depth + 1`.as('depth'),
              ]),
          ),
      )
      .selectFrom('pages')
      .select((eb) => [
        // hasDirectRestriction: this page itself has page_access entry
        eb
          .case()
          .when(
            eb.exists(
              eb
                .selectFrom('pageAccess')
                .select('pageAccess.id')
                .whereRef('pageAccess.pageId', '=', 'pages.id'),
            ),
          )
          .then(true)
          .else(false)
          .end()
          .as('hasDirectRestriction'),
        // hasInheritedRestriction: any ancestor (depth > 0) has page_access entry
        eb
          .case()
          .when(
            eb.exists(
              eb
                .selectFrom('ancestors')
                .innerJoin(
                  'pageAccess',
                  'pageAccess.pageId',
                  'ancestors.ancestorId',
                )
                .select('pageAccess.id')
                .where('ancestors.depth', '>', 0),
            ),
          )
          .then(true)
          .else(false)
          .end()
          .as('hasInheritedRestriction'),
        // canAccess: no restricted ancestor without ANY permission
        eb
          .case()
          .when(
            eb.not(
              eb.exists(
                eb
                  .selectFrom('ancestors')
                  .innerJoin(
                    'pageAccess',
                    'pageAccess.pageId',
                    'ancestors.ancestorId',
                  )
                  .leftJoin('pagePermissions', (join) =>
                    join
                      .onRef(
                        'pagePermissions.pageAccessId',
                        '=',
                        'pageAccess.id',
                      )
                      .on('pagePermissions.userId', '=', userId),
                  )
                  .select('pageAccess.pageId')
                  .where('pagePermissions.id', 'is', null),
              ),
            ),
          )
          .then(true)
          .else(false)
          .end()
          .as('canAccess'),
        // canEdit: nearest restricted ancestor determines edit capability
        eb
          .case()
          // traversal denied: any restricted ancestor without any permission
          .when(
            eb.exists(
              eb
                .selectFrom('ancestors')
                .innerJoin(
                  'pageAccess',
                  'pageAccess.pageId',
                  'ancestors.ancestorId',
                )
                .leftJoin('pagePermissions', (join) =>
                  join
                    .onRef('pagePermissions.pageAccessId', '=', 'pageAccess.id')
                    .on('pagePermissions.userId', '=', userId),
                )
                .select('pageAccess.pageId')
                .where('pagePermissions.id', 'is', null),
            ),
          )
          .then(false)
          // no restricted ancestors at all → defer to space permissions
          .when(
            eb.not(
              eb.exists(
                eb
                  .selectFrom('ancestors')
                  .innerJoin(
                    'pageAccess',
                    'pageAccess.pageId',
                    'ancestors.ancestorId',
                  )
                  .select('pageAccess.id'),
              ),
            ),
          )
          .then(true)
          // nearest restricted ancestor has writer for this user
          .when(
            eb.exists(
              eb
                .selectFrom('pagePermissions')
                .select('pagePermissions.id')
                .where('pagePermissions.role', '=', 'writer')
                .where(
                  'pagePermissions.pageAccessId',
                  '=',
                  sql<string>`(
                    SELECT pa.id FROM ancestors a_nr
                    JOIN page_access pa ON pa.page_id = a_nr.ancestor_id
                    ORDER BY a_nr.depth ASC
                    LIMIT 1
                  )`,
                )
                .where('pagePermissions.userId', '=', userId),
            ),
          )
          .then(true)
          .else(false)
          .end()
          .as('canEdit'),
      ])
      .where('pages.id', '=', pageId)
      .executeTakeFirst();

    const hasDirectRestriction = Boolean(result?.hasDirectRestriction);
    const hasInheritedRestriction = Boolean(result?.hasInheritedRestriction);

    return {
      hasDirectRestriction,
      hasInheritedRestriction,
      hasAnyRestriction: hasDirectRestriction || hasInheritedRestriction,
      canAccess: Boolean(result?.canAccess),
      canEdit: Boolean(result?.canEdit),
    };
  }

  /** Correlated predicate for queries that must authorize before LIMIT/OFFSET. */
  accessiblePageCondition(userId: string): RawBuilder<SqlBool> {
    // Parênteses externos: o predicado termina em `OR EXISTS (...)` e, sem
    // eles, os `.where()` encadeados depois só restringiam o primeiro ramo.
    return sql<SqlBool>`(
      (
      EXISTS (
        SELECT 1
        FROM spaces AS access_space
        INNER JOIN users AS access_user
          ON access_user.id = ${userId}::uuid
         AND access_user.workspace_id = access_space.workspace_id
        WHERE access_space.id = pages.space_id
          AND access_user.deleted_at IS NULL
          AND access_user.deactivated_at IS NULL
          AND (
            access_user.role IN ('owner', 'admin')
            OR (
              access_space.archived_at IS NULL
              AND EXISTS (
                SELECT 1
                FROM team_members AS access_membership
                LEFT JOIN space_permissions AS access_permission
                  ON access_permission.space_id = access_space.id
                 AND access_permission.user_id = access_membership.user_id
                WHERE access_membership.team_id = access_space.team_id
                  AND access_membership.user_id = access_user.id
                  AND (
                    access_membership.role = 'admin'
                    OR access_permission.can_view = true
                  )
              )
            )
          )
      )
      AND (
        EXISTS (
          SELECT 1
          FROM users AS workspace_admin
          WHERE workspace_admin.id = ${userId}::uuid
            AND workspace_admin.workspace_id = pages.workspace_id
            AND workspace_admin.role IN ('owner', 'admin')
        )
        OR EXISTS (
          SELECT 1
          FROM team_members AS team_admin_membership
          INNER JOIN spaces AS team_admin_space
            ON team_admin_space.id = pages.space_id
           AND team_admin_space.team_id = team_admin_membership.team_id
          WHERE team_admin_membership.user_id = ${userId}::uuid
            AND team_admin_membership.role = 'admin'
        )
        OR pages.creator_id = ${userId}::uuid
        OR NOT EXISTS (
          WITH RECURSIVE ancestors(id, parent_page_id) AS (
            SELECT candidate.id, candidate.parent_page_id
            FROM pages AS candidate
            WHERE candidate.id = pages.id
            UNION ALL
            SELECT parent.id, parent.parent_page_id
            FROM pages AS parent
            INNER JOIN ancestors ON ancestors.parent_page_id = parent.id
          )
          SELECT 1
          FROM ancestors
          INNER JOIN page_access ON page_access.page_id = ancestors.id
          WHERE NOT EXISTS (
            SELECT 1
            FROM page_permissions
            WHERE page_permissions.page_access_id = page_access.id
              AND page_permissions.user_id = ${userId}::uuid
          )
        )
      )
      )
      OR EXISTS (
        WITH RECURSIVE shared_ancestors AS (
          SELECT candidate.id, candidate.parent_page_id, 0 AS depth
          FROM pages candidate WHERE candidate.id = pages.id
          UNION ALL
          SELECT parent.id, parent.parent_page_id, shared_ancestors.depth + 1
          FROM pages parent JOIN shared_ancestors
            ON shared_ancestors.parent_page_id = parent.id
        )
        SELECT 1
        FROM shared_ancestors
        JOIN page_access shared_access ON shared_access.page_id = shared_ancestors.id
        JOIN page_permissions shared_permission
          ON shared_permission.page_access_id = shared_access.id
         AND (shared_ancestors.depth = 0 OR shared_permission.include_subpages = true)
        WHERE shared_permission.can_view = true
          AND (
            shared_permission.user_id = ${userId}::uuid
            OR shared_permission.workspace_wide = true
            OR EXISTS (
              SELECT 1 FROM team_members shared_target_team
              WHERE shared_target_team.team_id = shared_permission.team_id
                AND shared_target_team.user_id = ${userId}::uuid
            )
          )
      )
    )`;
  }

  /**
   * Filter a list of page IDs to only those the user can access.
   * Returns page IDs with their permission level (canEdit).
   * Single query implementation for efficiency.
   */
  async filterAccessiblePageIds(opts: {
    pageIds: string[];
    userId: string;
    spaceId?: string;
  }): Promise<string[]> {
    const { pageIds, userId } = opts;
    if (pageIds.length === 0) return [];

    const results = await this.db
      .selectFrom('pages')
      .select('pages.id')
      .where(sql<SqlBool>`pages.id = ANY(${pageIds}::uuid[])`)
      .where(this.accessiblePageCondition(userId))
      .execute();

    return results.map((r) => r.id);
  }

  async filterAccessiblePageIdsWithPermissions(
    pageIds: string[],
    userId: string,
  ): Promise<Array<{ id: string; canEdit: boolean; hasRestriction: boolean }>> {
    if (pageIds.length === 0) return [];

    const results = await this.db
      .withRecursive('allAncestors', (qb) =>
        qb
          .selectFrom('pages')
          .select([
            'pages.id as pageId',
            'pages.id as ancestorId',
            'pages.parentPageId',
            sql<number>`0`.as('depth'),
          ])
          .where(sql<SqlBool>`pages.id = ANY(${pageIds}::uuid[])`)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin(
                'allAncestors',
                'allAncestors.parentPageId',
                'pages.id',
              )
              .select([
                'allAncestors.pageId',
                'pages.id as ancestorId',
                'pages.parentPageId',
                sql<number>`all_ancestors.depth + 1`.as('depth'),
              ]),
          ),
      )
      .selectFrom('pages')
      .select('pages.id')
      .where(this.accessiblePageCondition(userId))
      .select((eb) =>
        eb
          .exists(
            eb
              .selectFrom('allAncestors')
              .innerJoin(
                'pageAccess',
                'pageAccess.pageId',
                'allAncestors.ancestorId',
              )
              .select('pageAccess.id')
              .whereRef('allAncestors.pageId', '=', 'pages.id'),
          )
          .as('hasRestriction'),
      )
      .select((eb) =>
        eb
          .case()
          // Workspace and Team admins inherit full page access, including
          // pages with direct restrictions.
          .when(
            sql<SqlBool>`
              EXISTS (
                SELECT 1
                FROM users AS permission_workspace_admin
                WHERE permission_workspace_admin.id = ${userId}::uuid
                  AND permission_workspace_admin.workspace_id = pages.workspace_id
                  AND permission_workspace_admin.role IN ('owner', 'admin')
              )
              OR EXISTS (
                SELECT 1
                FROM team_members AS permission_team_admin
                INNER JOIN spaces AS permission_team_space
                  ON permission_team_space.id = pages.space_id
                 AND permission_team_space.team_id = permission_team_admin.team_id
                WHERE permission_team_admin.user_id = ${userId}::uuid
                  AND permission_team_admin.role = 'admin'
              )
            `,
          )
          .then(true)
          // The author keeps editing their own page while retaining Space view.
          .when('pages.creatorId', '=', userId)
          .then(true)
          // no restricted ancestors for this page → defer to space
          .when(
            eb.not(
              eb.exists(
                eb
                  .selectFrom('allAncestors')
                  .innerJoin(
                    'pageAccess',
                    'pageAccess.pageId',
                    'allAncestors.ancestorId',
                  )
                  .select('pageAccess.id')
                  .whereRef('allAncestors.pageId', '=', 'pages.id'),
              ),
            ),
          )
          .then(true)
          // nearest restricted ancestor has writer for this user
          .when(
            eb.exists(
              eb
                .selectFrom('pagePermissions')
                .select('pagePermissions.id')
                .where('pagePermissions.canEdit', '=', true)
                .where(
                  'pagePermissions.pageAccessId',
                  '=',
                  sql<string>`(
                    SELECT pa.id FROM all_ancestors aa
                    JOIN page_access pa ON pa.page_id = aa.ancestor_id
                    WHERE aa.page_id = pages.id
                    ORDER BY aa.depth ASC
                    LIMIT 1
                  )`,
                )
                .where((permission) =>
                  permission.or([
                    permission('pagePermissions.userId', '=', userId),
                    permission('pagePermissions.workspaceWide', '=', true),
                    permission.exists(
                      permission
                        .selectFrom('teamMembers as permissionTeamMember')
                        .select('permissionTeamMember.userId')
                        .whereRef(
                          'permissionTeamMember.teamId',
                          '=',
                          'pagePermissions.teamId',
                        )
                        .where('permissionTeamMember.userId', '=', userId),
                    ),
                  ]),
                ),
            ),
          )
          .then(true)
          .else(false)
          .end()
          .as('canEdit'),
      )
      .where(sql<SqlBool>`pages.id = ANY(${pageIds}::uuid[])`)
      .execute();

    return results.map((r) => ({
      id: r.id,
      canEdit: Boolean(r.canEdit),
      hasRestriction: Boolean(r.hasRestriction),
    }));
  }

  /**
   * Check if a page or any of its ancestors has restrictions.
   * Used to determine if page-level permission checks are needed.
   */
  async hasRestrictedAncestor(pageId: string): Promise<boolean> {
    const result = await this.db
      .withRecursive('ancestors', (qb) =>
        qb
          .selectFrom('pages')
          .select(['pages.id as ancestorId', 'pages.parentPageId'])
          .where('pages.id', '=', pageId)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin('ancestors', 'ancestors.parentPageId', 'pages.id')
              .select(['pages.id as ancestorId', 'pages.parentPageId']),
          ),
      )
      .selectFrom('ancestors')
      .innerJoin('pageAccess', 'pageAccess.pageId', 'ancestors.ancestorId')
      .select('pageAccess.id')
      .where('pageAccess.accessMode', '=', 'restricted')
      .executeTakeFirst();

    return !!result;
  }

  /**
   * Bulk public-share guard. Returns only pages whose ancestry contains no
   * restricted access boundary, without issuing one recursive query per page.
   */
  async filterPageIdsWithoutRestrictedAncestor(
    pageIds: string[],
  ): Promise<string[]> {
    if (pageIds.length === 0) return [];

    const result = await sql<{ pageId: string }>`
      WITH RECURSIVE ancestors AS (
        SELECT candidate.id AS page_id,
               candidate.id AS ancestor_id,
               candidate.parent_page_id
        FROM pages AS candidate
        WHERE candidate.id = ANY(${pageIds}::uuid[])

        UNION ALL

        SELECT ancestors.page_id,
               parent.id AS ancestor_id,
               parent.parent_page_id
        FROM ancestors
        INNER JOIN pages AS parent
          ON ancestors.parent_page_id = parent.id
      )
      SELECT candidate.id AS "pageId"
      FROM unnest(${pageIds}::uuid[]) AS candidate(id)
      WHERE NOT EXISTS (
        SELECT 1
        FROM ancestors
        INNER JOIN page_access
          ON page_access.page_id = ancestors.ancestor_id
        WHERE ancestors.page_id = candidate.id
          AND page_access.access_mode = 'restricted'
      )
    `.execute(this.db);

    return result.rows.map((row) => row.pageId);
  }

  /**
   * Check if any page in a space has restrictions.
   * Used as a quick check to skip heavy permission filtering when no restrictions exist.
   */
  async hasRestrictedPagesInSpace(spaceId: string): Promise<boolean> {
    const result = await this.db
      .selectNoFrom((eb) =>
        eb
          .exists(
            eb
              .selectFrom('pageAccess')
              .select(sql`1`.as('one'))
              .where('pageAccess.spaceId', '=', spaceId),
          )
          .as('exists'),
      )
      .executeTakeFirst();

    return Boolean(result?.exists);
  }

  /**
   * Given a list of parent page IDs, return which ones have at least one accessible child.
   * Efficient batch query for sidebar hasChildren calculation.
   */
  async getParentIdsWithAccessibleChildren(
    parentIds: string[],
    userId: string,
  ): Promise<string[]> {
    if (parentIds.length === 0) return [];

    const results = await this.db
      .selectFrom('pages')
      .select('pages.parentPageId')
      .distinct()
      .where('pages.parentPageId', 'in', parentIds)
      .where('pages.deletedAt', 'is', null)
      .where(this.accessiblePageCondition(userId))
      .execute();

    return results
      .map((r) => r.parentPageId)
      .filter((parentPageId): parentPageId is string => Boolean(parentPageId));
  }

  /**
   * Get all page IDs within a subtree that are restricted OR are descendants of
   * restricted pages. Authenticated callers use this to apply page ACL rules.
   */
  async getRestrictedSubtreeIds(rootPageId: string): Promise<string[]> {
    const results = await this.db
      .withRecursive('descendants', (qb) =>
        qb
          .selectFrom('pages')
          .select(['pages.id as descendantId', 'pages.parentPageId'])
          .where('pages.id', '=', rootPageId)
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin(
                'descendants',
                'descendants.descendantId',
                'pages.parentPageId',
              )
              .select(['pages.id as descendantId', 'pages.parentPageId'])
              .where('pages.deletedAt', 'is', null),
          ),
      )
      .withRecursive('descendantAncestors', (qb) =>
        qb
          .selectFrom('descendants')
          .innerJoin('pages', 'pages.id', 'descendants.descendantId')
          .select([
            'descendants.descendantId',
            'pages.id as ancestorId',
            'pages.parentPageId as ancestorParentId',
          ])
          .unionAll((eb) =>
            eb
              .selectFrom('pages')
              .innerJoin(
                'descendantAncestors',
                'descendantAncestors.ancestorParentId',
                'pages.id',
              )
              .select([
                'descendantAncestors.descendantId',
                'pages.id as ancestorId',
                'pages.parentPageId as ancestorParentId',
              ]),
          ),
      )
      .selectFrom('descendantAncestors')
      .innerJoin(
        'pageAccess',
        'pageAccess.pageId',
        'descendantAncestors.ancestorId',
      )
      .select('descendantAncestors.descendantId')
      .distinct()
      .execute();

    return results.map((r) => r.descendantId);
  }

  /**
   * Given a pageId and a set of candidate userIds, return the subset who can
   * access the page (have permission on ALL restricted ancestors).
   * Returns all userIds if the page has no restricted ancestors.
   */
  async getUserIdsWithPageAccess(
    pageId: string,
    userIds: string[],
  ): Promise<string[]> {
    if (userIds.length === 0) return [];

    const results = await sql<{ userId: string }>`
      WITH RECURSIVE ancestors AS (
        SELECT id AS ancestor_id, parent_page_id
        FROM pages
        WHERE id = ${pageId}::uuid
        UNION ALL
        SELECT p.id, p.parent_page_id
        FROM pages p
        JOIN ancestors a ON a.parent_page_id = p.id
      )
      SELECT cu.user_id AS "userId"
      FROM unnest(${userIds}::uuid[]) AS cu(user_id)
      INNER JOIN users candidate_user ON candidate_user.id = cu.user_id
      CROSS JOIN pages target_page
      INNER JOIN spaces target_space ON target_space.id = target_page.space_id
      WHERE target_page.id = ${pageId}::uuid
        AND target_page.deleted_at IS NULL
        AND candidate_user.workspace_id = target_page.workspace_id
        AND candidate_user.deleted_at IS NULL
        AND candidate_user.deactivated_at IS NULL
        AND (
          candidate_user.role IN ('owner', 'admin')
          OR EXISTS (
            SELECT 1
            FROM team_members team_membership
            LEFT JOIN space_permissions space_permission
              ON space_permission.space_id = target_space.id
             AND space_permission.user_id = cu.user_id
            WHERE team_membership.user_id = cu.user_id
              AND team_membership.team_id = target_space.team_id
              AND (
                team_membership.role = 'admin'
                OR (
                  target_space.archived_at IS NULL
                  AND space_permission.can_view = true
                )
              )
          )
        )
    `.execute(this.db);

    return results.rows.map((r) => r.userId);
  }
}
