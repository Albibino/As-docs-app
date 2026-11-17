import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder, sql } from 'kysely';
import { jsonArrayFrom, jsonObjectFrom } from 'kysely/helpers/postgres';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { DbInterface } from '@tcc-docs/db/types/db.interface';
import {
  InsertableLabel,
  Label,
  UpdatableLabel,
} from '@tcc-docs/db/types/entity.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import { LabelOwnerScope, LabelScope } from './label-scope';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';

export type LabelTreeSummary = {
  id: string;
  name: string;
  slug: string;
  color: string | null;
  position: number;
};

export type LabelWithTree = Label & {
  tree: LabelTreeSummary | null;
  path?: string;
};

export type PageLabelAssignment = {
  pageId: string;
  labelId: string | null;
  labelTreeId: string | null;
  addedById: string | null;
};

@Injectable()
export class LabelRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly spaceMemberRepo: SpaceMemberRepo,
    private readonly pagePermissionRepo: PagePermissionRepo,
  ) {}

  /**
   * Restricts to labels reachable from `scope`: the workspace's own labels plus
   * those of every space in reach. See {@link LabelScope}.
   */
  private inScope(
    eb: ExpressionBuilder<DbInterface, 'labels'>,
    scope: LabelScope,
  ) {
    const scopeClauses = [eb('labels.spaceId', 'is', null)];

    if (scope.spaceIds.length > 0) {
      scopeClauses.push(eb('labels.spaceId', 'in', scope.spaceIds));
    }

    return eb.and([
      eb('labels.workspaceId', '=', scope.workspaceId),
      eb.or(scopeClauses),
    ]);
  }

  // The table union varies with each caller's joins; only `labels` has to be
  // in scope for the correlated subquery, which the generic can't express.
  private treeSummary(eb: ExpressionBuilder<DbInterface, any>) {
    return jsonObjectFrom(
      eb
        .selectFrom('labelTrees')
        .select([
          'labelTrees.id',
          'labelTrees.name',
          'labelTrees.slug',
          'labelTrees.color',
          'labelTrees.position',
        ])
        .whereRef('labelTrees.id', '=', 'labels.treeId'),
    ).as('tree');
  }

  async findById(
    labelId: string,
    trx?: KyselyTransaction,
  ): Promise<Label | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .selectAll()
      .where('id', '=', labelId)
      .executeTakeFirst();
  }

  async findByIdWithTree(
    labelId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ): Promise<LabelWithTree | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where('labels.id', '=', labelId);
    if (forUpdate) query = query.forUpdate();
    return query.executeTakeFirst() as Promise<LabelWithTree | undefined>;
  }

  /** Every label a page in `scope` may apply, with its tree inlined. */
  async findVisible(
    scope: LabelScope,
    trx?: KyselyTransaction,
  ): Promise<LabelWithTree[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where((eb) => this.inScope(eb, scope))
      .orderBy('labels.position', 'asc')
      .orderBy('labels.name', 'asc')
      .execute() as Promise<LabelWithTree[]>;
  }

  /**
   * Labels owned by exactly one scope — what an admin screen edits, as opposed
   * to what a page can use.
   */
  async findByOwnerScope(
    owner: LabelOwnerScope,
    trx?: KyselyTransaction,
  ): Promise<LabelWithTree[]> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where('labels.workspaceId', '=', owner.workspaceId);

    query = owner.spaceId
      ? query.where('labels.spaceId', '=', owner.spaceId)
      : query.where('labels.spaceId', 'is', null);

    return query
      .orderBy('labels.position', 'asc')
      .orderBy('labels.name', 'asc')
      .execute() as Promise<LabelWithTree[]>;
  }

  async findBySlug(
    owner: LabelOwnerScope,
    slug: string,
    trx?: KyselyTransaction,
  ): Promise<Label | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .selectAll()
      .where('workspaceId', '=', owner.workspaceId)
      .where('slug', '=', slug);
    query = query.where('treeId', 'is', null);

    query = owner.spaceId
      ? query.where('spaceId', '=', owner.spaceId)
      : query.where('spaceId', 'is', null);

    return query.executeTakeFirst();
  }

  /**
   * Resolves a slug against everything reachable from `scope`. Used when a
   * writer types a name that already exists somewhere in reach — the existing
   * label is reused rather than a near-duplicate being coined.
   */
  async findVisibleBySlug(
    scope: LabelScope,
    slug: string,
    trx?: KyselyTransaction,
  ): Promise<Label | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .selectAll('labels')
      .where('labels.slug', '=', slug)
      .where('labels.treeId', 'is', null)
      .where((eb) => this.inScope(eb, scope))
      .executeTakeFirst();
  }

  /**
   * Every label the user could encounter anywhere in the workspace: the
   * workspace's own plus those of each space they belong to. Backs the search
   * filter, which spans spaces and so cannot resolve a single scope.
   */
  async findVisibleForUser(
    workspaceId: string,
    userId: string,
  ): Promise<LabelWithTree[]> {
    return this.db
      .selectFrom('labels')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where('labels.workspaceId', '=', workspaceId)
      .where((eb) =>
        eb.or([
          eb('labels.spaceId', 'is', null),
          eb(
            'labels.spaceId',
            'in',
            this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
          ),
        ]),
      )
      .orderBy('labels.position', 'asc')
      .orderBy('labels.name', 'asc')
      .execute() as Promise<LabelWithTree[]>;
  }

  async findByIds(
    labelIds: string[],
    trx?: KyselyTransaction,
  ): Promise<Label[]> {
    if (labelIds.length === 0) return [];
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .selectAll()
      .where('id', 'in', labelIds)
      .execute();
  }

  async countByTreeId(
    treeId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .selectFrom('labels')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('treeId', '=', treeId)
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  async findByTreeId(
    treeId: string,
    trx?: KyselyTransaction,
  ): Promise<Label[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .selectAll()
      .where('treeId', '=', treeId)
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')
      .execute();
  }

  async create(data: InsertableLabel, trx?: KyselyTransaction): Promise<Label> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('labels')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async createIfAbsent(
    data: InsertableLabel,
    trx?: KyselyTransaction,
  ): Promise<Label | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('labels')
      .values(data)
      .onConflict((oc) => oc.doNothing())
      .returningAll()
      .executeTakeFirst();
  }

  async update(
    labelId: string,
    data: UpdatableLabel,
    trx?: KyselyTransaction,
  ): Promise<Label> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('labels')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', labelId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteLabel(labelId: string, trx?: KyselyTransaction): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db.deleteFrom('labels').where('id', '=', labelId).execute();
  }

  /**
   * Restates page_labels.label_tree_id after a label moves between groups.
   * The column is a denormalized copy that backs the one-label-per-group index,
   * so it has to be rewritten or the constraint would guard the wrong group.
   */
  async syncPageLabelTree(
    labelId: string,
    treeId: string | null,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .updateTable('pageLabels')
      .set({ labelTreeId: treeId })
      .where('labelId', '=', labelId)
      .execute();
  }

  /** Appends new labels after the existing ones instead of piling up at 0. */
  async nextPosition(
    owner: LabelOwnerScope,
    treeId: string | null,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .select((eb) => eb.fn.max('position').as('max'))
      .where('workspaceId', '=', owner.workspaceId);

    query = owner.spaceId
      ? query.where('spaceId', '=', owner.spaceId)
      : query.where('spaceId', 'is', null);

    query = treeId
      ? query.where('treeId', '=', treeId)
      : query.where('treeId', 'is', null);

    const result = await query.executeTakeFirst();
    return result?.max == null ? 0 : Number(result.max) + 1;
  }

  /**
   * Pages that already carry a different label from `targetTreeId` and would
   * therefore break the one-label-per-tree rule if `labelId` joined it.
   */
  async countTreeMoveConflicts(
    labelId: string,
    targetTreeId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .selectFrom('pageLabels as moved')
      .innerJoin('pageLabels as occupant', (join) =>
        join
          .onRef('occupant.pageId', '=', 'moved.pageId')
          .on('occupant.labelTreeId', '=', targetTreeId)
          .on('occupant.labelId', '!=', labelId),
      )
      .select((eb) => eb.fn.count<string>('moved.id').as('count'))
      .where('moved.labelId', '=', labelId)
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  async countPages(
    labelId: string,
    userId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    const result = await db
      .selectFrom('pageLabels')
      .innerJoin('pages', 'pages.id', 'pageLabels.pageId')
      .select((eb) => eb.fn.count<string>('pageLabels.id').as('count'))
      .where('labelId', '=', labelId)
      .where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
      )
      .where(this.pagePermissionRepo.accessiblePageCondition(userId))
      .executeTakeFirst();

    return Number(result?.count ?? 0);
  }

  /**
   * A page carries few labels, so this returns all of them — grouped ones
   * first, ordered by their group, then the ungrouped ones. Postgres sorts
   * NULLs last on ASC, which puts ungrouped labels at the end for free.
   */
  async findLabelsByPageId(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<LabelWithTree[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .innerJoin('pageLabels', 'pageLabels.labelId', 'labels.id')
      .leftJoin('labelTrees', 'labelTrees.id', 'labels.treeId')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where('pageLabels.pageId', '=', pageId)
      .where('labels.treeId', 'is', null)
      .orderBy('labelTrees.position', 'asc')
      .orderBy('labels.position', 'asc')
      .orderBy('labels.name', 'asc')
      .execute() as Promise<LabelWithTree[]>;
  }

  /** Batch variant for listings, so a page list is one query and not N. */
  async findLabelsByPageIds(
    pageIds: string[],
    trx?: KyselyTransaction,
  ): Promise<Map<string, LabelWithTree[]>> {
    if (pageIds.length === 0) return new Map();

    const db = dbOrTx(this.db, trx);
    const rows = await db
      .selectFrom('labels')
      .innerJoin('pageLabels', 'pageLabels.labelId', 'labels.id')
      .leftJoin('labelTrees', 'labelTrees.id', 'labels.treeId')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .select('pageLabels.pageId as pageId')
      .where('pageLabels.pageId', 'in', pageIds)
      .orderBy('labelTrees.position', 'asc')
      .orderBy('labels.position', 'asc')
      .orderBy('labels.name', 'asc')
      .execute();
    const treeOnlyRows = await db
      .selectFrom('pageLabels')
      .innerJoin('labelTrees', 'labelTrees.id', 'pageLabels.labelTreeId')
      .select([
        'pageLabels.pageId as pageId',
        'labelTrees.id as treeId',
        'labelTrees.name as treeName',
        'labelTrees.slug as treeSlug',
        'labelTrees.color as treeColor',
        'labelTrees.position as treePosition',
        'labelTrees.workspaceId as workspaceId',
        'labelTrees.spaceId as spaceId',
        'labelTrees.createdAt as createdAt',
        'labelTrees.updatedAt as updatedAt',
      ])
      .where('pageLabels.pageId', 'in', pageIds)
      .where('pageLabels.labelId', 'is', null)
      .execute();

    const treeIds = [
      ...new Set(
        (rows as Array<{ treeId?: string | null }>).flatMap((row) =>
          row.treeId ? [row.treeId] : [],
        ),
      ),
    ];
    const treeNodes = treeIds.length
      ? await db
          .selectFrom('labels')
          .select(['id', 'name', 'parentId', 'treeId'])
          .where('treeId', 'in', treeIds)
          .execute()
      : [];
    const nodesByTree = new Map<
      string,
      Map<string, (typeof treeNodes)[number]>
    >();
    for (const node of treeNodes) {
      if (!node.treeId) continue;
      const nodes = nodesByTree.get(node.treeId) ?? new Map();
      nodes.set(node.id, node);
      nodesByTree.set(node.treeId, nodes);
    }
    const pathFor = (label: any) => {
      if (!label.treeId) return label.name;
      const nodes = nodesByTree.get(label.treeId);
      if (!nodes) return label.name;
      const path = [label.name];
      const visited = new Set<string>([label.id]);
      let parent = label.parentId ? nodes.get(label.parentId) : undefined;
      while (parent && !visited.has(parent.id)) {
        visited.add(parent.id);
        path.unshift(parent.name);
        parent = parent.parentId ? nodes.get(parent.parentId) : undefined;
      }
      return label.tree?.name
        ? `${label.tree.name} / ${path.join(' / ')}`
        : path.join(' / ');
    };

    const byPage = new Map<string, LabelWithTree[]>();
    for (const { pageId, ...label } of rows as any[]) {
      label.path = pathFor(label);
      const list = byPage.get(pageId);
      if (list) {
        list.push(label as LabelWithTree);
      } else {
        byPage.set(pageId, [label as LabelWithTree]);
      }
    }
    for (const row of treeOnlyRows as any[]) {
      const treeOnlyLabel = {
        id: `tree:${row.treeId}`,
        name: row.treeName,
        slug: row.treeSlug,
        description: null,
        color: row.treeColor,
        position: row.treePosition,
        kind: 'group',
        parentId: null,
        treeId: row.treeId,
        createdById: null,
        workspaceId: row.workspaceId,
        spaceId: row.spaceId,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
        tree: {
          id: row.treeId,
          name: row.treeName,
          slug: row.treeSlug,
          color: row.treeColor,
          position: row.treePosition,
        },
        path: row.treeName,
      } satisfies LabelWithTree;
      const list = byPage.get(row.pageId);
      if (list) list.push(treeOnlyLabel);
      else byPage.set(row.pageId, [treeOnlyLabel]);
    }
    return byPage;
  }

  /** The label currently occupying `treeId` on this page, if any. */
  async findPageLabelInTree(
    pageId: string,
    treeId: string,
    trx?: KyselyTransaction,
  ): Promise<LabelWithTree | undefined> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labels')
      .innerJoin('pageLabels', 'pageLabels.labelId', 'labels.id')
      .selectAll('labels')
      .select((eb) => this.treeSummary(eb))
      .where('pageLabels.pageId', '=', pageId)
      .where('pageLabels.labelTreeId', '=', treeId)
      .executeTakeFirst() as Promise<LabelWithTree | undefined>;
  }

  async hasPageLabel(
    pageId: string,
    labelId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const db = dbOrTx(this.db, trx);
    const row = await db
      .selectFrom('pageLabels')
      .select('id')
      .where('pageId', '=', pageId)
      .where('labelId', '=', labelId)
      .executeTakeFirst();

    return !!row;
  }

  async insertPageLabel(
    assignment: PageLabelAssignment,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const db = dbOrTx(this.db, trx);
    const inserted = await db
      .insertInto('pageLabels')
      .values(assignment)
      .onConflict((oc) => oc.doNothing())
      .returning('id')
      .executeTakeFirst();
    return !!inserted;
  }

  async deletePageLabel(
    pageId: string,
    labelId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const db = dbOrTx(this.db, trx);
    const deleted = await db
      .deleteFrom('pageLabels')
      .where('pageId', '=', pageId)
      .where('labelId', '=', labelId)
      .returning('id')
      .executeTakeFirst();
    return !!deleted;
  }

  async findPageTaxonomyAssignment(
    pageId: string,
    treeId: string,
    trx?: KyselyTransaction,
  ): Promise<(PageLabelAssignment & { id: string }) | undefined> {
    return dbOrTx(this.db, trx)
      .selectFrom('pageLabels')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('labelTreeId', '=', treeId)
      .executeTakeFirst();
  }

  async findPageTaxonomyAssignments(
    pageId: string,
    trx?: KyselyTransaction,
  ): Promise<Array<PageLabelAssignment & { id: string }>> {
    return dbOrTx(this.db, trx)
      .selectFrom('pageLabels')
      .selectAll()
      .where('pageId', '=', pageId)
      .where('labelTreeId', 'is not', null)
      .execute() as Promise<Array<PageLabelAssignment & { id: string }>>;
  }

  async deletePageLabelAssignment(
    assignmentId: string,
    trx?: KyselyTransaction,
  ): Promise<boolean> {
    const deleted = await dbOrTx(this.db, trx)
      .deleteFrom('pageLabels')
      .where('id', '=', assignmentId)
      .returning('id')
      .executeTakeFirst();
    return !!deleted;
  }

  async findPagesByTreeId(
    treeId: string,
    userId: string,
    opts: {
      spaceId?: string;
      query?: string;
      pagination: PaginationOptions;
    },
  ) {
    return this.findPagesByLabelId(treeId, userId, opts, 'tree');
  }

  async findPagesByLabelId(
    labelId: string,
    userId: string,
    opts: {
      spaceId?: string;
      query?: string;
      pagination: PaginationOptions;
    },
    targetType: 'label' | 'tree' = 'label',
  ) {
    let query =
      // Apply page-level restrictions before cursor pagination. Filtering a
      // page-sized result afterwards would leak restricted rows through sparse
      // pages/cursors and could hide accessible results behind them.
      this.db
        .selectFrom('pages')
        .innerJoin('pageLabels', 'pageLabels.pageId', 'pages.id')
        .select((eb) => [
          'pages.id',
          'pages.slugId',
          'pages.title',
          'pages.icon',
          'pages.spaceId',
          'pages.createdAt',
          'pages.updatedAt',
          jsonObjectFrom(
            eb
              .selectFrom('spaces')
              .select([
                'spaces.id',
                'spaces.name',
                'spaces.slug',
                'spaces.logo',
              ])
              .whereRef('spaces.id', '=', 'pages.spaceId'),
          ).as('space'),
          jsonObjectFrom(
            eb
              .selectFrom('users')
              .select(['users.id', 'users.name', 'users.avatarUrl'])
              .whereRef('users.id', '=', 'pages.creatorId'),
          ).as('creator'),
          jsonArrayFrom(
            eb
              .selectFrom('labels')
              .innerJoin('pageLabels as pl', 'pl.labelId', 'labels.id')
              .select(['labels.id', 'labels.name', 'labels.color'])
              .whereRef('pl.pageId', '=', 'pages.id')
              .orderBy('labels.position', 'asc')
              .orderBy('labels.name', 'asc'),
          ).as('labels'),
        ])
        .where((eb) =>
          targetType === 'tree'
            ? eb('pageLabels.labelTreeId', '=', labelId)
            : eb.or([
                eb('pageLabels.labelId', '=', labelId),
                eb(
                  'pageLabels.labelId',
                  'in',
                  eb
                    .selectFrom('labelNodeClosures')
                    .select('labelNodeClosures.descendantId')
                    .where('labelNodeClosures.ancestorId', '=', labelId),
                ),
              ]),
        )
        .where('pages.deletedAt', 'is', null).where(sql<boolean>`NOT EXISTS (
        WITH RECURSIVE ancestors AS (
          SELECT pages.id, pages.parent_page_id
          UNION ALL
          SELECT parent.id, parent.parent_page_id
          FROM pages AS parent
          INNER JOIN ancestors ON ancestors.parent_page_id = parent.id
        )
        SELECT 1
        FROM ancestors
        INNER JOIN page_access
          ON page_access.page_id = ancestors.id
        LEFT JOIN page_permissions
          ON page_permissions.page_access_id = page_access.id
          AND page_permissions.user_id = ${userId}
        WHERE page_permissions.id IS NULL
      )`);

    if (opts.spaceId) {
      query = query.where('pages.spaceId', '=', opts.spaceId);
    } else {
      query = query.where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
      );
    }

    if (opts.query) {
      query = query.where('pages.title', 'ilike', `%${opts.query}%`);
    }

    const result = await executeWithCursorPagination(query, {
      perPage: opts.pagination.limit,
      cursor: opts.pagination.cursor,
      beforeCursor: opts.pagination.beforeCursor,
      fields: [
        { expression: 'pages.updatedAt', direction: 'desc', key: 'updatedAt' },
        { expression: 'pages.id', direction: 'desc', key: 'id' },
      ],
      parseCursor: (cursor) => ({
        updatedAt: new Date(cursor.updatedAt),
        id: cursor.id,
      }),
    });
    const labelsByPage = await this.findLabelsByPageIds(
      result.items.map((item) => item.id),
    );
    return {
      ...result,
      items: result.items.map((item) => ({
        ...item,
        labels: labelsByPage.get(item.id) ?? [],
      })),
    };
  }

  async getLabelPageCountForUser(
    labelId: string,
    userId: string,
    spaceId?: string,
  ): Promise<number> {
    let query = this.db
      .selectFrom('pageLabels')
      .innerJoin('pages', 'pages.id', 'pageLabels.pageId')
      .select((eb) => eb.fn.count<string>('pageLabels.id').as('count'))
      .where('pageLabels.labelId', '=', labelId)
      .where('pages.deletedAt', 'is', null);

    if (spaceId) {
      query = query.where('pages.spaceId', '=', spaceId);
    } else {
      query = query.where(
        'pages.spaceId',
        'in',
        this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
      );
    }

    const result = await query.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
}
