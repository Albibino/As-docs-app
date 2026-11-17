import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { LabelTree, Page, User } from '@tcc-docs/db/types/entity.types';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import {
  LabelNode,
  LabelTreeRepo,
  LabelTreeSummary,
} from '@tcc-docs/db/repos/label/label-tree.repo';
import { LabelRepo, LabelWithTree } from '@tcc-docs/db/repos/label/label.repo';
import {
  isInLabelScope,
  resolveLabelScope,
} from '@tcc-docs/db/repos/label/label-scope';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { isValidLabelName, toLabelSlug } from './utils';
import { LabelAuditService } from './label-audit.service';
import { PageAccessService } from '../page/page-access/page-access.service';

export type TaxonomyPath = {
  tree: LabelTreeSummary;
  selectedNodeId: string | null;
  nodes: LabelNode[];
};

export type PageTaxonomy = {
  paths: TaxonomyPath[];
  freeLabels: LabelWithTree[];
};

export type ApplyLabelResult = {
  label: LabelWithTree;
  replaced?: LabelWithTree;
};

export type LabelInfo =
  | (LabelWithTree & {
      targetType: 'label';
      ancestors: LabelNode[];
    })
  | (LabelTree & {
      targetType: 'tree';
      ancestors: [];
    });

@Injectable()
export class LabelService {
  constructor(
    private readonly labelRepo: LabelRepo,
    private readonly labelTreeRepo: LabelTreeRepo,
    private readonly labelAudit: LabelAuditService,
    private readonly pageRepo: PageRepo,
    private readonly pageAccessService: PageAccessService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async getPageLabels(pageId: string): Promise<LabelWithTree[]> {
    return this.labelRepo.findLabelsByPageId(pageId);
  }

  async getPageTaxonomy(pageId: string): Promise<PageTaxonomy> {
    const [assignments, freeLabels] = await Promise.all([
      this.labelRepo.findPageTaxonomyAssignments(pageId),
      this.labelRepo.findLabelsByPageId(pageId),
    ]);
    const treeIds = [
      ...new Set(
        assignments
          .map((assignment) => assignment.labelTreeId)
          .filter((treeId): treeId is string => !!treeId),
      ),
    ];
    const [trees, nodes] = await Promise.all([
      this.labelTreeRepo.findByIds(treeIds),
      this.labelTreeRepo.findNodesByTreeIds(treeIds),
    ]);
    const treeById = new Map(trees.map((tree) => [tree.id, tree]));
    const nodesById = new Map(nodes.map((node) => [node.id, node]));
    const paths = assignments.map((assignment) => {
      const tree = treeById.get(assignment.labelTreeId!);
      if (!tree) return null;
      const pathNodes: LabelNode[] = [];
      const visited = new Set<string>();
      let node = assignment.labelId
        ? nodesById.get(assignment.labelId)
        : undefined;
      while (node && !visited.has(node.id)) {
        visited.add(node.id);
        pathNodes.unshift(node);
        node = node.parentId ? nodesById.get(node.parentId) : undefined;
      }
      return {
        tree: {
          id: tree.id,
          name: tree.name,
          slug: tree.slug,
          color: tree.color,
          position: tree.position,
        },
        selectedNodeId: assignment.labelId,
        nodes: pathNodes,
      } satisfies TaxonomyPath;
    });
    return {
      paths: paths
        .filter((path): path is TaxonomyPath => !!path)
        .sort((a, b) => a.tree.position - b.tree.position),
      freeLabels,
    };
  }

  async getLabelInfo(labelId: string): Promise<LabelInfo | undefined> {
    const label = await this.labelRepo.findByIdWithTree(labelId);
    if (label) {
      const ancestors = label.treeId
        ? await this.labelTreeRepo.findAncestors(label.id)
        : [];

      return {
        ...label,
        targetType: 'label',
        ancestors: ancestors.filter((ancestor) => ancestor.id !== label.id),
      };
    }

    const tree = await this.labelTreeRepo.findById(labelId);
    if (!tree) return undefined;

    return {
      ...tree,
      targetType: 'tree',
      ancestors: [],
    };
  }

  async getAvailableLabels(workspaceId: string, spaceId: string | null) {
    const scope = await resolveLabelScope(workspaceId, spaceId);
    const [trees, labels] = await Promise.all([
      this.labelTreeRepo.findVisible(scope),
      this.labelRepo.findVisible(scope),
    ]);
    const nodes = await this.labelTreeRepo.findNodesByTreeIds(
      trees.map((tree) => tree.id),
    );
    return {
      trees: trees.map((tree) => ({
        ...tree,
        nodes: nodes.filter((node) => node.treeId === tree.id),
      })),
      freeLabels: labels.filter((label) => label.treeId === null),
    };
  }

  async getSearchableLabels(workspaceId: string, userId: string) {
    const [trees, labels] = await Promise.all([
      this.labelTreeRepo.findVisibleForUser(workspaceId, userId),
      this.labelRepo.findVisibleForUser(workspaceId, userId),
    ]);
    const nodes = await this.labelTreeRepo.findNodesByTreeIds(
      trees.map((tree) => tree.id),
    );
    return {
      trees: trees.map((tree) => ({
        ...tree,
        nodes: nodes.filter((node) => node.treeId === tree.id),
      })),
      freeLabels: labels.filter((label) => label.treeId === null),
    };
  }

  async applyLabel(
    page: Page,
    labelId: string,
    user: User,
    existingTrx?: KyselyTransaction,
  ): Promise<ApplyLabelResult> {
    return executeTx(
      this.db,
      async (trx) => {
        const currentPage = await this.lockEditablePage(page, user, trx);
        const label = await this.labelRepo.findByIdWithTree(labelId, trx, true);
        if (!label || label.treeId !== null) {
          throw new NotFoundException('Free label not found');
        }
        const scope = await resolveLabelScope(
          currentPage.workspaceId,
          currentPage.spaceId,
        );
        if (!isInLabelScope(label, scope)) {
          throw new NotFoundException('Free label not found');
        }
        if (await this.labelRepo.hasPageLabel(currentPage.id, label.id, trx)) {
          return { label };
        }
        const inserted = await this.labelRepo.insertPageLabel(
          {
            pageId: currentPage.id,
            labelId: label.id,
            labelTreeId: null,
            addedById: user.id,
          },
          trx,
        );
        if (!inserted) return { label };
        await this.labelAudit.logLabelApplied(
          currentPage,
          label,
          user.id,
          undefined,
          trx,
        );
        return { label };
      },
      existingTrx,
    );
  }

  async createAndApplyLabel(
    page: Page,
    name: string,
    user: User,
  ): Promise<ApplyLabelResult> {
    if (!isValidLabelName(name))
      throw new BadRequestException('Invalid label name');
    const slug = toLabelSlug(name);
    return executeTx(this.db, async (trx) => {
      const currentPage = await this.lockEditablePage(page, user, trx);
      const scope = await resolveLabelScope(
        currentPage.workspaceId,
        currentPage.spaceId,
      );
      const existing = await this.labelRepo.findVisibleBySlug(scope, slug, trx);
      if (existing) return this.applyLabel(currentPage, existing.id, user, trx);
      const created = await this.labelRepo.createIfAbsent(
        {
          name: name.trim(),
          slug,
          kind: 'label',
          parentId: null,
          treeId: null,
          description: null,
          color: null,
          position: await this.labelRepo.nextPosition(
            {
              workspaceId: currentPage.workspaceId,
              spaceId: currentPage.spaceId,
            },
            null,
            trx,
          ),
          workspaceId: currentPage.workspaceId,
          spaceId: currentPage.spaceId,
          createdById: user.id,
        },
        trx,
      );
      const label =
        created ?? (await this.labelRepo.findVisibleBySlug(scope, slug, trx));
      if (!label) throw new BadRequestException('Label changed concurrently');
      return this.applyLabel(currentPage, label.id, user, trx);
    });
  }

  async selectTaxonomyPath(
    page: Page,
    treeId: string,
    nodeId: string | null,
    user: User,
    existingTrx?: KyselyTransaction,
  ) {
    return executeTx(
      this.db,
      async (trx) => {
        const currentPage = await this.lockEditablePage(page, user, trx);
        const scope = await resolveLabelScope(
          currentPage.workspaceId,
          currentPage.spaceId,
        );
        const tree = await this.labelTreeRepo.findById(treeId, trx, true);
        if (!tree || !isInLabelScope(tree, scope)) {
          throw new NotFoundException('Label tree not found');
        }
        let node: LabelNode | undefined;
        if (nodeId) {
          node = await this.labelTreeRepo.findNodeById(nodeId, trx, true);
          if (
            !node ||
            node.treeId !== tree.id ||
            !isInLabelScope(node, scope)
          ) {
            throw new NotFoundException('Label node not found');
          }
        }
        const previousAssignment =
          await this.labelRepo.findPageTaxonomyAssignment(
            currentPage.id,
            tree.id,
            trx,
          );
        const previous = previousAssignment
          ? await this.pathFromAssignment(tree, previousAssignment.labelId, trx)
          : null;
        if (
          previousAssignment &&
          previousAssignment.labelId === (node?.id ?? null)
        ) {
          return { previous, current: previous };
        }
        if (previousAssignment) {
          await this.labelRepo.deletePageLabelAssignment(
            previousAssignment.id,
            trx,
          );
        }
        await this.labelRepo.insertPageLabel(
          {
            pageId: currentPage.id,
            labelId: node?.id ?? null,
            labelTreeId: tree.id,
            addedById: user.id,
          },
          trx,
        );
        const current = await this.pathFromAssignment(
          tree,
          node?.id ?? null,
          trx,
        );
        await this.labelAudit.logTaxonomySelection(
          currentPage,
          previous,
          current,
          user.id,
          trx,
        );
        return { previous, current };
      },
      existingTrx,
    );
  }

  async truncateTaxonomy(page: Page, nodeId: string, user: User) {
    const current = await this.getPageTaxonomy(page.id);
    const path = current.paths.find((item) =>
      item.nodes.some((node) => node.id === nodeId),
    );
    if (!path) return { previous: null, current: null };
    const index = path.nodes.findIndex((node) => node.id === nodeId);
    const replacement = index > 0 ? path.nodes[index - 1].id : null;
    return this.selectTaxonomyPath(page, path.tree.id, replacement, user);
  }

  async removeTaxonomy(
    page: Page,
    treeId: string,
    user: User,
    existingTrx?: KyselyTransaction,
  ): Promise<void> {
    await executeTx(
      this.db,
      async (trx) => {
        const currentPage = await this.lockEditablePage(page, user, trx);
        const scope = await resolveLabelScope(
          currentPage.workspaceId,
          currentPage.spaceId,
        );
        const tree = await this.labelTreeRepo.findById(treeId, trx, true);
        if (!tree || !isInLabelScope(tree, scope)) {
          throw new NotFoundException('Label tree not found');
        }
        const assignment = await this.labelRepo.findPageTaxonomyAssignment(
          currentPage.id,
          treeId,
          trx,
        );
        if (!assignment) return;
        const previous = await this.pathFromAssignment(
          tree,
          assignment.labelId,
          trx,
        );
        await this.labelRepo.deletePageLabelAssignment(assignment.id, trx);
        await this.labelAudit.logTaxonomySelection(
          currentPage,
          previous,
          null,
          user.id,
          trx,
        );
      },
      existingTrx,
    );
  }

  async removeLabel(
    page: Page,
    labelId: string,
    user: User,
    existingTrx?: KyselyTransaction,
  ): Promise<void> {
    await executeTx(
      this.db,
      async (trx) => {
        const currentPage = await this.lockEditablePage(page, user, trx);
        const label = await this.labelRepo.findByIdWithTree(labelId, trx, true);
        if (!label || label.treeId !== null) return;
        const deleted = await this.labelRepo.deletePageLabel(
          currentPage.id,
          labelId,
          trx,
        );
        if (deleted)
          await this.labelAudit.logLabelRemoved(
            currentPage,
            label,
            user.id,
            trx,
          );
      },
      existingTrx,
    );
  }

  async getPageLabelHistory(
    pageId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    return this.labelAudit.findPageLabelHistory(
      pageId,
      workspaceId,
      pagination,
    );
  }

  private async pathFromAssignment(
    tree: LabelTreeSummary,
    nodeId: string | null,
    trx?: KyselyTransaction,
  ): Promise<TaxonomyPath> {
    return {
      tree,
      selectedNodeId: nodeId,
      nodes: nodeId ? await this.labelTreeRepo.findAncestors(nodeId, trx) : [],
    };
  }

  private async lockEditablePage(
    snapshot: Page,
    user: User,
    trx: KyselyTransaction,
  ): Promise<Page> {
    const page = await this.pageRepo.findById(snapshot.id, {
      trx,
      withLock: true,
    });
    if (!page || page.deletedAt || page.workspaceId !== snapshot.workspaceId)
      throw new NotFoundException('Page not found');
    await this.pageAccessService.validateCanEdit(page, user);
    return page;
  }

  async findPagesByLabel(
    labelId: string,
    userId: string,
    opts: { spaceId?: string; query?: string; pagination: PaginationOptions },
    targetType: LabelInfo['targetType'] = 'label',
  ) {
    return targetType === 'tree'
      ? this.labelRepo.findPagesByTreeId(labelId, userId, opts)
      : this.labelRepo.findPagesByLabelId(labelId, userId, opts);
  }
}
