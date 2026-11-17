import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { ExpressionBuilder } from 'kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { DbInterface } from '@tcc-docs/db/types/db.interface';
import {
  InsertableLabelTree,
  Label,
  LabelTree,
  UpdatableLabelTree,
} from '@tcc-docs/db/types/entity.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import { LabelOwnerScope, LabelScope } from './label-scope';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { reorderSiblingIds } from './label-node-order';

export type LabelTreeSummary = Pick<
  LabelTree,
  'id' | 'name' | 'slug' | 'color' | 'position'
>;

export type LabelNode = Label & {
  kind: 'group' | 'label';
  treeId: string;
  parentId: string | null;
};

export type LabelTreeWithNodes = LabelTree & {
  nodes: LabelNode[];
};

@Injectable()
export class LabelTreeRepo {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly pagePermissionRepo: PagePermissionRepo,
    private readonly spaceMemberRepo: SpaceMemberRepo,
  ) {}

  private inScope(
    eb: ExpressionBuilder<DbInterface, 'labelTrees'>,
    scope: LabelScope,
  ) {
    const scopeClauses = [eb('labelTrees.spaceId', 'is', null)];
    if (scope.spaceIds.length > 0) {
      scopeClauses.push(eb('labelTrees.spaceId', 'in', scope.spaceIds));
    }

    return eb.and([
      eb('labelTrees.workspaceId', '=', scope.workspaceId),
      eb.or(scopeClauses),
    ]);
  }

  async findById(
    treeId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ): Promise<LabelTree | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labelTrees')
      .selectAll()
      .where('id', '=', treeId);
    if (forUpdate) query = query.forUpdate();
    return query.executeTakeFirst();
  }

  async findByIds(
    treeIds: string[],
    trx?: KyselyTransaction,
  ): Promise<LabelTree[]> {
    if (treeIds.length === 0) return [];
    return dbOrTx(this.db, trx)
      .selectFrom('labelTrees')
      .selectAll()
      .where('id', 'in', treeIds)
      .execute();
  }

  async lockTree(
    treeId: string,
    trx: KyselyTransaction,
  ): Promise<LabelTree | undefined> {
    return this.findById(treeId, trx, true);
  }

  async findVisible(
    scope: LabelScope,
    trx?: KyselyTransaction,
  ): Promise<LabelTree[]> {
    const db = dbOrTx(this.db, trx);
    return db
      .selectFrom('labelTrees')
      .selectAll()
      .where((eb) => this.inScope(eb, scope))
      .orderBy((eb) =>
        eb.case().when('spaceId', 'is', null).then(0).else(1).end(),
      )
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')
      .execute();
  }

  async findByOwnerScope(
    owner: LabelOwnerScope,
    trx?: KyselyTransaction,
  ): Promise<LabelTree[]> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labelTrees')
      .selectAll()
      .where('workspaceId', '=', owner.workspaceId);
    query = owner.spaceId
      ? query.where('spaceId', '=', owner.spaceId)
      : query.where('spaceId', 'is', null);
    return query.orderBy('position', 'asc').orderBy('name', 'asc').execute();
  }

  async findVisibleForUser(
    workspaceId: string,
    userId: string,
  ): Promise<LabelTree[]> {
    return this.db
      .selectFrom('labelTrees')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where((eb) =>
        eb.or([
          eb('spaceId', 'is', null),
          eb(
            'spaceId',
            'in',
            this.spaceMemberRepo.getUserSpaceIdsQuery(userId),
          ),
        ]),
      )
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')
      .execute();
  }

  async findBySlug(
    owner: LabelOwnerScope,
    slug: string,
    trx?: KyselyTransaction,
  ): Promise<LabelTree | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labelTrees')
      .selectAll()
      .where('workspaceId', '=', owner.workspaceId)
      .where('slug', '=', slug);
    query = owner.spaceId
      ? query.where('spaceId', '=', owner.spaceId)
      : query.where('spaceId', 'is', null);
    return query.executeTakeFirst();
  }

  async nextPosition(
    owner: LabelOwnerScope,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labelTrees')
      .select((eb) => eb.fn.max('position').as('max'))
      .where('workspaceId', '=', owner.workspaceId);
    query = owner.spaceId
      ? query.where('spaceId', '=', owner.spaceId)
      : query.where('spaceId', 'is', null);
    const result = await query.executeTakeFirst();
    return result?.max == null ? 0 : Number(result.max) + 1;
  }

  async create(
    data: InsertableLabelTree,
    trx?: KyselyTransaction,
  ): Promise<LabelTree> {
    return dbOrTx(this.db, trx)
      .insertInto('labelTrees')
      .values(data)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async update(
    treeId: string,
    data: UpdatableLabelTree,
    trx?: KyselyTransaction,
  ): Promise<LabelTree> {
    return dbOrTx(this.db, trx)
      .updateTable('labelTrees')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', treeId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async deleteTree(treeId: string, trx?: KyselyTransaction): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('labelTrees')
      .where('id', '=', treeId)
      .execute();
  }

  async findNodesByTreeIds(
    treeIds: string[],
    trx?: KyselyTransaction,
  ): Promise<LabelNode[]> {
    if (treeIds.length === 0) return [];
    return dbOrTx(this.db, trx)
      .selectFrom('labels')
      .selectAll()
      .where('treeId', 'in', treeIds)
      .orderBy('treeId', 'asc')
      .orderBy('position', 'asc')
      .orderBy('name', 'asc')
      .execute() as Promise<LabelNode[]>;
  }

  async listOwnedWithNodes(
    owner: LabelOwnerScope,
    trx?: KyselyTransaction,
  ): Promise<LabelTreeWithNodes[]> {
    const trees = await this.findByOwnerScope(owner, trx);
    const nodes = await this.findNodesByTreeIds(
      trees.map((tree) => tree.id),
      trx,
    );
    const nodesByTree = new Map<string, LabelNode[]>();
    for (const node of nodes) {
      const treeNodes = nodesByTree.get(node.treeId);
      if (treeNodes) treeNodes.push(node);
      else nodesByTree.set(node.treeId, [node]);
    }
    return trees.map((tree) => ({
      ...tree,
      nodes: nodesByTree.get(tree.id) ?? [],
    }));
  }

  async findNodeById(
    nodeId: string,
    trx?: KyselyTransaction,
    forUpdate = false,
  ): Promise<LabelNode | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .selectAll()
      .where('id', '=', nodeId)
      .where('treeId', 'is not', null);
    if (forUpdate) query = query.forUpdate();
    return query.executeTakeFirst() as Promise<LabelNode | undefined>;
  }

  async findNodeBySlug(
    treeId: string,
    parentId: string | null,
    slug: string,
    trx?: KyselyTransaction,
  ): Promise<LabelNode | undefined> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .selectAll()
      .where('treeId', '=', treeId)
      .where('slug', '=', slug);
    query = parentId === null
      ? query.where('parentId', 'is', null)
      : query.where('parentId', '=', parentId);
    return query.executeTakeFirst() as Promise<LabelNode | undefined>;
  }

  async nextNodePosition(
    treeId: string,
    parentId: string | null,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .select((eb) => eb.fn.max('position').as('max'))
      .where('treeId', '=', treeId);
    query = parentId === null
      ? query.where('parentId', 'is', null)
      : query.where('parentId', '=', parentId);
    const result = await query.executeTakeFirst();
    return result?.max == null ? 0 : Number(result.max) + 1;
  }

  async createNode(
    data: {
      treeId: string;
      parentId: string | null;
      kind: 'group' | 'label';
      name: string;
      slug: string;
      description: string | null;
      color: string | null;
      position: number;
      workspaceId: string;
      spaceId: string | null;
      createdById: string;
    },
    trx: KyselyTransaction,
  ): Promise<{ node: LabelNode; convertedParent?: LabelNode }> {
    const db = dbOrTx(this.db, trx);
    let convertedParent: LabelNode | undefined;
    if (data.parentId) {
      const parent = await this.findNodeById(data.parentId, trx, true);
      if (!parent || parent.treeId !== data.treeId) {
        throw new Error('The parent node is outside the selected tree');
      }
      if (parent.kind === 'label') {
        convertedParent = (await db
          .updateTable('labels')
          .set({ kind: 'group', updatedAt: new Date() })
          .where('id', '=', parent.id)
          .returningAll()
          .executeTakeFirstOrThrow()) as LabelNode;
      }
    }

    const node = (await db
      .insertInto('labels')
      .values({
        name: data.name,
        slug: data.slug,
        kind: data.kind,
        parentId: data.parentId,
        treeId: data.treeId,
        description: data.description,
        color: data.color,
        position: data.position,
        workspaceId: data.workspaceId,
        spaceId: data.spaceId,
        createdById: data.createdById,
      })
      .returningAll()
      .executeTakeFirstOrThrow()) as LabelNode;

    const ancestors = data.parentId
      ? await db
          .selectFrom('labelNodeClosures')
          .select(['ancestorId', 'depth'])
          .where('treeId', '=', data.treeId)
          .where('descendantId', '=', data.parentId)
          .execute()
      : [];
    await db
      .insertInto('labelNodeClosures')
      .values([
        { treeId: data.treeId, ancestorId: node.id, descendantId: node.id, depth: 0 },
        ...ancestors.map((ancestor) => ({
          treeId: data.treeId,
          ancestorId: ancestor.ancestorId,
          descendantId: node.id,
          depth: Number(ancestor.depth) + 1,
        })),
      ])
      .execute();

    return { node, convertedParent };
  }

  async updateNode(
    nodeId: string,
    data: Record<string, unknown>,
    trx?: KyselyTransaction,
  ): Promise<LabelNode> {
    return dbOrTx(this.db, trx)
      .updateTable('labels')
      .set({ ...data, updatedAt: new Date() })
      .where('id', '=', nodeId)
      .where('treeId', 'is not', null)
      .returningAll()
      .executeTakeFirstOrThrow() as Promise<LabelNode>;
  }

  async findAncestors(
    nodeId: string,
    trx?: KyselyTransaction,
  ): Promise<LabelNode[]> {
    return dbOrTx(this.db, trx)
      .selectFrom('labelNodeClosures')
      .innerJoin('labels', 'labels.id', 'labelNodeClosures.ancestorId')
      .selectAll('labels')
      .where('labelNodeClosures.descendantId', '=', nodeId)
      .orderBy('labelNodeClosures.depth', 'desc')
      .execute() as Promise<LabelNode[]>;
  }

  async findDescendantIds(
    nodeId: string,
    trx?: KyselyTransaction,
  ): Promise<string[]> {
    const rows = await dbOrTx(this.db, trx)
      .selectFrom('labelNodeClosures')
      .select('descendantId')
      .where('ancestorId', '=', nodeId)
      .execute();
    return rows.map((row) => row.descendantId);
  }

  async moveNode(
    nodeId: string,
    parentId: string | null,
    position: number,
    trx: KyselyTransaction,
  ): Promise<LabelNode> {
    const db = dbOrTx(this.db, trx);
    const node = await this.findNodeById(nodeId, trx, true);
    if (!node) throw new Error('Label node not found');
    if (node.parentId !== parentId) {
      throw new Error('Label nodes can only be reordered among siblings');
    }

    const subtreeIds = await this.findDescendantIds(nodeId, trx);
    if (parentId && subtreeIds.includes(parentId)) {
      throw new Error('A label node cannot be moved below its descendant');
    }

    const siblingRows = await db
      .selectFrom('labels')
      .select(['id', 'position', 'name'])
      .where('treeId', '=', node.treeId)
      .$if(parentId === null, (query) => query.where('parentId', 'is', null))
      .$if(parentId !== null, (query) => query.where('parentId', '=', parentId))
      .execute();
    const siblingIds = reorderSiblingIds(
      siblingRows.map((sibling) => ({
        id: sibling.id,
        position: Number(sibling.position),
        name: sibling.name,
      })),
      nodeId,
      position,
    );

    for (const [siblingPosition, siblingId] of siblingIds.entries()) {
      await db
        .updateTable('labels')
        .set({ position: siblingPosition, updatedAt: new Date() })
        .where('id', '=', siblingId)
        .execute();
    }

    return (await this.findNodeById(nodeId, trx))!;
  }

  async compactSiblings(
    treeId: string,
    parentId: string | null,
    exceptNodeId: string | undefined,
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('labels')
      .select('id')
      .where('treeId', '=', treeId);
    query = parentId === null
      ? query.where('parentId', 'is', null)
      : query.where('parentId', '=', parentId);
    if (exceptNodeId) query = query.where('id', '!=', exceptNodeId);
    const siblings = await query.orderBy('position', 'asc').orderBy('name', 'asc').execute();
    for (const [position, sibling] of siblings.entries()) {
      await db
        .updateTable('labels')
        .set({ position, updatedAt: new Date() })
        .where('id', '=', sibling.id)
        .execute();
    }
  }

  async countSubtreeNodes(
    nodeId: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const ids = await this.findDescendantIds(nodeId, trx);
    return ids.length;
  }

  async countAffectedPages(
    treeId: string,
    userId: string,
    nodeId?: string,
    trx?: KyselyTransaction,
  ): Promise<number> {
    const db = dbOrTx(this.db, trx);
    let query = db
      .selectFrom('pageLabels')
      .innerJoin('pages', 'pages.id', 'pageLabels.pageId')
      .select((eb) => eb.fn.count<number>('pageLabels.pageId').distinct().as('count'))
      .where('pageLabels.labelTreeId', '=', treeId)
      .where('pages.deletedAt', 'is', null)
      .where(this.pagePermissionRepo.accessiblePageCondition(userId));
    if (nodeId) {
      const ids = await this.findDescendantIds(nodeId, trx);
      query = query.where('pageLabels.labelId', 'in', ids);
    }
    const result = await query.executeTakeFirst();
    return Number(result?.count ?? 0);
  }
}
