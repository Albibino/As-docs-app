import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Label, LabelTree } from '@tcc-docs/db/types/entity.types';
import {
  LabelNode,
  LabelTreeRepo,
  LabelTreeWithNodes,
} from '@tcc-docs/db/repos/label/label-tree.repo';
import { LabelRepo } from '@tcc-docs/db/repos/label/label.repo';
import { LabelOwnerScope } from '@tcc-docs/db/repos/label/label-scope';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { executeTx } from '@tcc-docs/db/utils';
import {
  CreateLabelDto,
  CreateLabelNodeDto,
  CreateLabelTreeDto,
  MoveLabelNodeDto,
  UpdateLabelDto,
  UpdateLabelNodeDto,
  UpdateLabelTreeDto,
} from './dto/label.dto';
import { isValidLabelName, toLabelSlug } from './utils';
import { LabelAuditService } from './label-audit.service';
import { AuditEvent, AuditResource } from '../../common/events/audit-events';

/**
 * Owns mutations to curated trees/nodes and to free tags. Document selection
 * is intentionally kept in LabelService so page permissions cannot be mixed
 * with taxonomy administration permissions.
 */
@Injectable()
export class LabelAdminService {
  constructor(
    private readonly labelRepo: LabelRepo,
    private readonly labelTreeRepo: LabelTreeRepo,
    private readonly labelAudit: LabelAuditService,
    @InjectKysely() private readonly db: KyselyDB,
  ) {}

  async listOwned(owner: LabelOwnerScope): Promise<{
    trees: LabelTreeWithNodes[];
    freeLabels: Label[];
  }> {
    const [trees, labels] = await Promise.all([
      this.labelTreeRepo.listOwnedWithNodes(owner),
      this.labelRepo.findByOwnerScope(owner),
    ]);
    return {
      trees,
      freeLabels: labels.filter((label) => label.treeId === null),
    };
  }

  async createTree(
    owner: LabelOwnerScope,
    dto: CreateLabelTreeDto,
    userId: string,
  ): Promise<LabelTree> {
    const slug = this.toSlugOrThrow(dto.name);
    return executeTx(this.db, async (trx) => {
      await this.assertUniqueTree(owner, slug, trx);
      const tree = await this.labelTreeRepo.create(
        {
          name: dto.name.trim(),
          slug,
          description: dto.description ?? null,
          color: dto.color ?? null,
          position: await this.labelTreeRepo.nextPosition(owner, trx),
          workspaceId: owner.workspaceId,
          spaceId: owner.spaceId,
          createdById: userId,
        },
        trx,
      );
      await this.labelAudit.logTaxonomyChange({
        workspaceId: owner.workspaceId,
        actorId: userId,
        event: AuditEvent.LABEL_TREE_CREATED,
        resourceType: AuditResource.LABEL_TREE,
        resourceId: tree.id,
        spaceId: owner.spaceId,
        changes: { after: this.treeSnapshot(tree) },
        trx,
      });
      return tree;
    });
  }

  async updateTree(
    tree: LabelTree,
    dto: UpdateLabelTreeDto,
    actorId: string,
  ): Promise<LabelTree> {
    return executeTx(this.db, async (trx) => {
      const patch: Record<string, unknown> = {};
      if (dto.name !== undefined) {
        const slug = this.toSlugOrThrow(dto.name);
        await this.assertUniqueTree(
          { workspaceId: tree.workspaceId, spaceId: tree.spaceId },
          slug,
          trx,
          tree.id,
        );
        patch.name = dto.name.trim();
        patch.slug = slug;
      }
      if (dto.description !== undefined) patch.description = dto.description;
      if (dto.color !== undefined) patch.color = dto.color;
      if (dto.position !== undefined) patch.position = dto.position;
      const updated = await this.labelTreeRepo.update(tree.id, patch, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: tree.workspaceId,
        actorId,
        event: AuditEvent.LABEL_TREE_UPDATED,
        resourceType: AuditResource.LABEL_TREE,
        resourceId: tree.id,
        spaceId: tree.spaceId,
        changes: {
          before: this.treeSnapshot(tree),
          after: this.treeSnapshot(updated),
        },
        trx,
      });
      return updated;
    });
  }

  async deleteTree(tree: LabelTree, actorId: string): Promise<void> {
    await executeTx(this.db, async (trx) => {
      const nodes = await this.labelTreeRepo.findNodesByTreeIds([tree.id], trx);
      await this.labelAudit.logAssignmentsRemovedForLabels(
        nodes.map((node) => node.id),
        actorId,
        'tree-deleted',
        trx,
      );
      await this.labelAudit.logTreeOnlyAssignmentsRemoved(
        tree.id,
        actorId,
        'tree-deleted',
        trx,
      );
      await this.labelTreeRepo.deleteTree(tree.id, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: tree.workspaceId,
        actorId,
        event: AuditEvent.LABEL_TREE_DELETED,
        resourceType: AuditResource.LABEL_TREE,
        resourceId: tree.id,
        spaceId: tree.spaceId,
        changes: {
          before: { ...this.treeSnapshot(tree), nodeCount: nodes.length },
        },
        trx,
      });
    });
  }

  async countTreeAffectedPages(treeId: string, userId: string): Promise<number> {
    return this.labelTreeRepo.countAffectedPages(treeId, userId);
  }

  async createNode(
    owner: LabelOwnerScope,
    dto: CreateLabelNodeDto,
    userId: string,
  ): Promise<{ node: LabelNode; convertedParent?: LabelNode }> {
    const slug = this.toSlugOrThrow(dto.name);
    return executeTx(this.db, async (trx) => {
      const tree = await this.assertTreeOwner(dto.treeId, owner, trx);
      const parent = dto.parentId
        ? await this.assertNodeOwner(dto.parentId, owner, dto.treeId, trx)
        : null;
      await this.assertUniqueNode(dto.treeId, dto.parentId ?? null, slug, trx);
      const result = await this.labelTreeRepo.createNode(
        {
          treeId: tree.id,
          parentId: parent?.id ?? null,
          kind: dto.kind,
          name: dto.name.trim(),
          slug,
          description: dto.description ?? null,
          color: dto.color ?? null,
          position:
            dto.position ??
            (await this.labelTreeRepo.nextNodePosition(
              tree.id,
              parent?.id ?? null,
              trx,
            )),
          workspaceId: owner.workspaceId,
          spaceId: owner.spaceId,
          createdById: userId,
        },
        trx,
      );
      await this.labelAudit.logTaxonomyChange({
        workspaceId: owner.workspaceId,
        actorId: userId,
        event: AuditEvent.LABEL_NODE_CREATED,
        resourceType: AuditResource.LABEL_NODE,
        resourceId: result.node.id,
        spaceId: owner.spaceId,
        changes: {
          after: this.nodeSnapshot(result.node),
          convertedParent: result.convertedParent
            ? this.nodeSnapshot(result.convertedParent)
            : undefined,
        },
        trx,
      });
      return result;
    });
  }

  async updateNode(
    node: LabelNode,
    dto: UpdateLabelNodeDto,
    actorId: string,
  ): Promise<LabelNode> {
    return executeTx(this.db, async (trx) => {
      const patch: Record<string, unknown> = {};
      if (dto.name !== undefined) {
        const slug = this.toSlugOrThrow(dto.name);
        await this.assertUniqueNode(
          node.treeId,
          node.parentId,
          slug,
          trx,
          node.id,
        );
        patch.name = dto.name.trim();
        patch.slug = slug;
      }
      if (dto.description !== undefined) patch.description = dto.description;
      if (dto.color !== undefined) patch.color = dto.color;
      const updated = await this.labelTreeRepo.updateNode(node.id, patch, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: node.workspaceId,
        actorId,
        event: AuditEvent.LABEL_NODE_UPDATED,
        resourceType: AuditResource.LABEL_NODE,
        resourceId: node.id,
        spaceId: node.spaceId,
        changes: {
          before: this.nodeSnapshot(node),
          after: this.nodeSnapshot(updated),
        },
        trx,
      });
      return updated;
    });
  }

  async moveNode(
    node: LabelNode,
    dto: MoveLabelNodeDto,
    actorId: string,
  ): Promise<LabelNode> {
    return executeTx(this.db, async (trx) => {
      const tree = await this.labelTreeRepo.lockTree(node.treeId, trx);
      if (
        !tree ||
        tree.workspaceId !== node.workspaceId ||
        tree.spaceId !== node.spaceId
      ) {
        throw new NotFoundException('Label tree not found');
      }
      const current = await this.labelTreeRepo.findNodeById(node.id, trx, true);
      if (!current) throw new NotFoundException('Label node not found');
      const parentId = dto.parentId ?? null;
      if (parentId !== current.parentId) {
        throw new ConflictException(
          'Label nodes can only be reordered among siblings',
        );
      }
      const descendants = await this.labelTreeRepo.findDescendantIds(node.id, trx);
      if (parentId && descendants.includes(parentId)) {
        throw new ConflictException(
          'A label node cannot be moved below its descendant',
        );
      }
      const parent = parentId
        ? await this.assertNodeOwner(
            parentId,
            { workspaceId: node.workspaceId, spaceId: node.spaceId },
            node.treeId,
            trx,
          )
        : null;
      await this.assertUniqueNode(
        node.treeId,
        parent?.id ?? null,
        current.slug,
        trx,
        current.id,
      );
      const previousPath = await this.labelTreeRepo.findAncestors(node.id, trx);
      const moved = await this.labelTreeRepo.moveNode(
        node.id,
        parentId,
        dto.position,
        trx,
      );
      const nextPath = await this.labelTreeRepo.findAncestors(node.id, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: node.workspaceId,
        actorId,
        event: AuditEvent.LABEL_NODE_MOVED,
        resourceType: AuditResource.LABEL_NODE,
        resourceId: node.id,
        spaceId: node.spaceId,
        changes: {
          before: {
            node: this.nodeSnapshot(current),
            path: previousPath.map((item) => item.name),
          },
          after: {
            node: this.nodeSnapshot(moved),
            path: nextPath.map((item) => item.name),
          },
        },
        trx,
      });
      return moved;
    });
  }

  async getMoveImpact(
    node: LabelNode,
    dto: MoveLabelNodeDto,
    userId: string,
  ) {
    const tree = await this.labelTreeRepo.findById(node.treeId);
    if (!tree) throw new NotFoundException('Label tree not found');
    const parentId = dto.parentId ?? null;
    if (parentId !== node.parentId) {
      throw new ConflictException(
        'Label nodes can only be reordered among siblings',
      );
    }
    const currentPath = await this.labelTreeRepo.findAncestors(node.id);
    let nextPath: LabelNode[];
    if (parentId) {
      const descendants = await this.labelTreeRepo.findDescendantIds(node.id);
      if (descendants.includes(parentId)) {
        throw new ConflictException('A label node cannot be moved below its descendant');
      }
      const parent = await this.labelTreeRepo.findNodeById(parentId);
      if (!parent || parent.treeId !== node.treeId) {
        throw new ConflictException('The move target belongs to a different tree');
      }
      const sibling = await this.labelTreeRepo.findNodeBySlug(
        node.treeId,
        parent.id,
        node.slug,
      );
      if (sibling && sibling.id !== node.id) {
        throw new ConflictException(
          'A label node with this name already exists here',
        );
      }
      const parentPath = await this.labelTreeRepo.findAncestors(parent.id);
      nextPath = [...parentPath, node];
    } else {
      const sibling = await this.labelTreeRepo.findNodeBySlug(
        node.treeId,
        null,
        node.slug,
      );
      if (sibling && sibling.id !== node.id) {
        throw new ConflictException(
          'A label node with this name already exists here',
        );
      }
      nextPath = [node];
    }

    return {
      currentPath: [tree.name, ...currentPath.map((item) => item.name)],
      nextPath: [tree.name, ...nextPath.map((item) => item.name)],
      pageCount: await this.labelTreeRepo.countAffectedPages(
        node.treeId,
        userId,
        node.id,
      ),
    };
  }

  async countNodeAffectedPages(nodeId: string, userId: string): Promise<number> {
    const node = await this.labelTreeRepo.findNodeById(nodeId);
    if (!node) throw new NotFoundException('Label node not found');
    return this.labelTreeRepo.countAffectedPages(node.treeId, userId, nodeId);
  }

  async deleteNode(node: LabelNode, actorId: string): Promise<void> {
    await executeTx(this.db, async (trx) => {
      const ids = await this.labelTreeRepo.findDescendantIds(node.id, trx);
      await this.labelAudit.logAssignmentsRemovedForLabels(
        ids,
        actorId,
        'node-deleted',
        trx,
      );
      await trx.deleteFrom('labels').where('id', 'in', ids).execute();
      await this.labelTreeRepo.compactSiblings(
        node.treeId,
        node.parentId,
        undefined,
        trx,
      );
      await this.labelAudit.logTaxonomyChange({
        workspaceId: node.workspaceId,
        actorId,
        event: AuditEvent.LABEL_NODE_DELETED,
        resourceType: AuditResource.LABEL_NODE,
        resourceId: node.id,
        spaceId: node.spaceId,
        changes: {
          before: { node: this.nodeSnapshot(node), nodeCount: ids.length },
        },
        trx,
      });
    });
  }

  async createLabel(
    owner: LabelOwnerScope,
    dto: CreateLabelDto,
    userId: string,
  ): Promise<Label> {
    const slug = this.toSlugOrThrow(dto.name);
    return executeTx(this.db, async (trx) => {
      if (await this.labelRepo.findBySlug(owner, slug, trx)) {
        throw new ConflictException(
          'A free label with this name already exists',
        );
      }
      return this.labelRepo.create(
        {
          name: dto.name.trim(),
          slug,
          kind: 'label',
          parentId: null,
          treeId: null,
          description: dto.description ?? null,
          color: dto.color ?? null,
          position: await this.labelRepo.nextPosition(owner, null, trx),
          workspaceId: owner.workspaceId,
          spaceId: owner.spaceId,
          createdById: userId,
        },
        trx,
      );
    });
  }

  async updateLabel(
    label: Label,
    dto: UpdateLabelDto,
    actorId: string,
  ): Promise<Label> {
    if (label.treeId !== null) {
      throw new BadRequestException(
        'Free labels cannot be moved into a taxonomy tree',
      );
    }
    const patch: Record<string, unknown> = {};
    if (dto.name !== undefined) {
      const slug = this.toSlugOrThrow(dto.name);
      const clash = await this.labelRepo.findBySlug(
        { workspaceId: label.workspaceId, spaceId: label.spaceId },
        slug,
      );
      if (clash && clash.id !== label.id) {
        throw new ConflictException(
          'A free label with this name already exists',
        );
      }
      patch.name = dto.name.trim();
      patch.slug = slug;
    }
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.color !== undefined) patch.color = dto.color;
    if (dto.position !== undefined) patch.position = dto.position;
    return executeTx(this.db, async (trx) => {
      const updated = await this.labelRepo.update(label.id, patch, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: label.workspaceId,
        actorId,
        event: AuditEvent.LABEL_UPDATED,
        resourceType: AuditResource.LABEL,
        resourceId: label.id,
        spaceId: label.spaceId,
        changes: { before: { name: label.name }, after: { name: updated.name } },
        trx,
      });
      return updated;
    });
  }

  async deleteLabel(label: Label, actorId: string): Promise<void> {
    if (label.treeId !== null) {
      throw new BadRequestException(
        'Taxonomy nodes must be deleted through the node endpoint',
      );
    }
    await executeTx(this.db, async (trx) => {
      await this.labelAudit.logAssignmentsRemovedForLabels(
        [label.id],
        actorId,
        'label-deleted',
        trx,
      );
      await this.labelRepo.deleteLabel(label.id, trx);
      await this.labelAudit.logTaxonomyChange({
        workspaceId: label.workspaceId,
        actorId,
        event: AuditEvent.LABEL_DELETED,
        resourceType: AuditResource.LABEL,
        resourceId: label.id,
        spaceId: label.spaceId,
        changes: { before: { name: label.name } },
        trx,
      });
    });
  }

  async countLabelPages(labelId: string, userId: string): Promise<number> {
    return this.labelRepo.countPages(labelId, userId);
  }

  private async assertUniqueTree(
    owner: LabelOwnerScope,
    slug: string,
    trx?: KyselyTransaction,
    exceptId?: string,
  ) {
    const existing = await this.labelTreeRepo.findBySlug(owner, slug, trx);
    if (existing && existing.id !== exceptId) {
      throw new ConflictException('A label tree with this name already exists');
    }
  }

  private async assertUniqueNode(
    treeId: string,
    parentId: string | null,
    slug: string,
    trx?: KyselyTransaction,
    exceptId?: string,
  ) {
    const existing = await this.labelTreeRepo.findNodeBySlug(
      treeId,
      parentId,
      slug,
      trx,
    );
    if (existing && existing.id !== exceptId) {
      throw new ConflictException(
        'A label node with this name already exists here',
      );
    }
  }

  private async assertTreeOwner(
    treeId: string,
    owner: LabelOwnerScope,
    trx?: KyselyTransaction,
  ): Promise<LabelTree> {
    const tree = await this.labelTreeRepo.findById(treeId, trx);
    if (
      !tree ||
      tree.workspaceId !== owner.workspaceId ||
      tree.spaceId !== owner.spaceId
    ) {
      throw new NotFoundException('Label tree not found');
    }
    return tree;
  }

  private async assertNodeOwner(
    nodeId: string,
    owner: LabelOwnerScope,
    treeId: string,
    trx?: KyselyTransaction,
  ): Promise<LabelNode> {
    const node = await this.labelTreeRepo.findNodeById(nodeId, trx);
    if (
      !node ||
      node.treeId !== treeId ||
      node.workspaceId !== owner.workspaceId ||
      node.spaceId !== owner.spaceId
    ) {
      throw new BadRequestException(
        'The label node belongs to a different tree or scope',
      );
    }
    return node;
  }

  private treeSnapshot(tree: LabelTree) {
    return {
      id: tree.id,
      name: tree.name,
      slug: tree.slug,
      color: tree.color,
      position: tree.position,
    };
  }

  private nodeSnapshot(node: LabelNode) {
    return {
      id: node.id,
      name: node.name,
      slug: node.slug,
      kind: node.kind,
      treeId: node.treeId,
      parentId: node.parentId,
      color: node.color,
      position: node.position,
    };
  }

  private toSlugOrThrow(name: string): string {
    if (!isValidLabelName(name)) {
      throw new BadRequestException('Invalid label name');
    }
    return toLabelSlug(name);
  }
}
