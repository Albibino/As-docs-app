import { ConflictException } from '@nestjs/common';
import { LabelAdminService } from './label-admin.service';

const owner = { workspaceId: 'workspace-1', spaceId: null };
const tree = {
  id: 'tree-1',
  workspaceId: owner.workspaceId,
  spaceId: owner.spaceId,
  name: 'Module',
} as any;
const node = {
  id: 'node-1',
  treeId: tree.id,
  parentId: null,
  slug: 'erp',
  kind: 'label',
  workspaceId: owner.workspaceId,
  spaceId: owner.spaceId,
  name: 'ERP',
} as any;

function createService() {
  const trx = {};
  const db = {
    transaction: jest.fn().mockReturnValue({
      execute: (callback: (transaction: unknown) => unknown) => callback(trx),
    }),
  };
  const labelRepo = {
    findBySlug: jest.fn().mockResolvedValue(undefined),
    findByOwnerScope: jest.fn(),
    update: jest.fn(),
    deleteLabel: jest.fn(),
  };
  const labelTreeRepo = {
    findById: jest.fn().mockResolvedValue(tree),
    lockTree: jest.fn().mockResolvedValue(tree),
    findNodeById: jest.fn().mockResolvedValue(node),
    findDescendantIds: jest.fn().mockResolvedValue([node.id]),
    findNodeBySlug: jest.fn().mockResolvedValue(undefined),
    findAncestors: jest.fn().mockResolvedValue([node]),
    moveNode: jest.fn().mockResolvedValue(node),
    compactSiblings: jest.fn(),
    createNode: jest.fn().mockResolvedValue({ node }),
    nextNodePosition: jest.fn().mockResolvedValue(0),
  };
  const labelAudit = {
    logTaxonomyChange: jest.fn(),
    logAssignmentsRemovedForLabels: jest.fn(),
    logTreeOnlyAssignmentsRemoved: jest.fn(),
  };
  const service = new LabelAdminService(
    labelRepo as any,
    labelTreeRepo as any,
    labelAudit as any,
    db as any,
  );
  return { service, labelTreeRepo, labelAudit, trx };
}

describe('LabelAdminService taxonomy invariants', () => {
  it('rejects moving a node below its own descendant before mutating the tree', async () => {
    const { service, labelTreeRepo } = createService();
    const descendant = { ...node, id: 'node-child', parentId: node.id };
    labelTreeRepo.findDescendantIds.mockResolvedValue([node.id, descendant.id]);

    await expect(
      service.moveNode(node, { nodeId: node.id, parentId: descendant.id, position: 0 }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(labelTreeRepo.moveNode).not.toHaveBeenCalled();
  });

  it('rejects a move that would duplicate a sibling slug', async () => {
    const { service, labelTreeRepo } = createService();
    const parent = { ...node, id: 'node-parent', slug: 'parent', kind: 'group' };
    const currentNode = { ...node, parentId: parent.id };
    const sibling = { ...node, id: 'node-sibling', parentId: parent.id };
    labelTreeRepo.findNodeById.mockImplementation(async (id: string) =>
      id === parent.id ? parent : currentNode,
    );
    labelTreeRepo.findNodeBySlug.mockResolvedValue(sibling);

    await expect(
      service.moveNode(currentNode, { nodeId: currentNode.id, parentId: parent.id, position: 0 }, 'user-1'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(labelTreeRepo.moveNode).not.toHaveBeenCalled();
  });

  it('rejects changing the parent while reordering a node', async () => {
    const { service, labelTreeRepo } = createService();
    const currentParent = {
      ...node,
      id: 'node-current-parent',
      slug: 'current-parent',
      kind: 'group',
    };
    const otherParent = {
      ...node,
      id: 'node-other-parent',
      slug: 'other-parent',
      kind: 'group',
    };
    const currentNode = { ...node, parentId: currentParent.id };
    labelTreeRepo.findNodeById.mockImplementation(async (id: string) => {
      if (id === currentNode.id) return currentNode;
      if (id === otherParent.id) return otherParent;
      return undefined;
    });
    labelTreeRepo.findDescendantIds.mockResolvedValue([currentNode.id]);

    await expect(
      service.moveNode(
        currentNode,
        { nodeId: currentNode.id, parentId: otherParent.id, position: 0 },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(labelTreeRepo.moveNode).not.toHaveBeenCalled();
  });

  it('rejects removing the parent while reordering a nested node', async () => {
    const { service, labelTreeRepo } = createService();
    const currentNode = { ...node, parentId: 'node-parent' };
    labelTreeRepo.findNodeById.mockResolvedValue(currentNode);
    labelTreeRepo.findDescendantIds.mockResolvedValue([currentNode.id]);

    await expect(
      service.moveNode(
        currentNode,
        { nodeId: currentNode.id, parentId: null, position: 0 },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(labelTreeRepo.moveNode).not.toHaveBeenCalled();
  });

  it('keeps the current parent when reordering a sibling', async () => {
    const { service, labelTreeRepo, trx } = createService();
    const parent = { ...node, id: 'node-parent', slug: 'parent', kind: 'group' };
    const currentNode = { ...node, parentId: parent.id, position: 2 };
    const reorderedNode = { ...currentNode, position: 0 };
    labelTreeRepo.findNodeById.mockImplementation(async (id: string) =>
      id === parent.id ? parent : currentNode,
    );
    labelTreeRepo.moveNode.mockResolvedValue(reorderedNode);

    const result = await service.moveNode(
      currentNode,
      { nodeId: currentNode.id, parentId: parent.id, position: 0 },
      'user-1',
    );

    expect(result).toEqual(reorderedNode);
    expect(labelTreeRepo.moveNode).toHaveBeenCalledWith(
      currentNode.id,
      parent.id,
      0,
      trx,
    );
  });

  it('rejects a move impact preview that changes the parent', async () => {
    const { service, labelTreeRepo } = createService();
    const currentNode = { ...node, parentId: 'node-parent' };

    await expect(
      service.getMoveImpact(
        currentNode,
        { nodeId: currentNode.id, parentId: null, position: 0 },
        'user-1',
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(labelTreeRepo.findAncestors).not.toHaveBeenCalled();
  });

  it('creates a child and records when its label parent is promoted to a group', async () => {
    const { service, labelTreeRepo, labelAudit, trx } = createService();
    const resultNode = { ...node, id: 'node-child', parentId: node.id };
    const convertedParent = { ...node, kind: 'group' };
    labelTreeRepo.createNode.mockResolvedValue({
      node: resultNode,
      convertedParent,
    });

    const result = await service.createNode(
      owner,
      {
        treeId: tree.id,
        parentId: node.id,
        kind: 'label',
        name: 'Apps',
      },
      'user-1',
    );

    expect(result).toEqual({ node: resultNode, convertedParent });
    expect(labelTreeRepo.createNode).toHaveBeenCalledWith(
      expect.objectContaining({
        treeId: tree.id,
        parentId: node.id,
        kind: 'label',
      }),
      trx,
    );
    expect(labelAudit.logTaxonomyChange).toHaveBeenCalled();
  });
});
