import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LabelService } from './label.service';

const page = {
  id: 'page-1',
  workspaceId: 'workspace-1',
  spaceId: 'space-1',
} as any;
const user = { id: 'user-1' } as any;
const tree = {
  id: 'tree-status',
  workspaceId: page.workspaceId,
  spaceId: null,
  name: 'Status',
  slug: 'status',
  color: 'blue',
  position: 0,
} as any;
const root = {
  id: 'node-status',
  workspaceId: page.workspaceId,
  spaceId: null,
  treeId: tree.id,
  parentId: null,
  kind: 'group',
  name: 'Status',
  slug: 'status',
  color: null,
} as any;
const child = {
  ...root,
  id: 'node-todo',
  parentId: root.id,
  kind: 'label',
  name: 'Todo',
  slug: 'todo',
};
const freeLabel = {
  id: 'label-urgent',
  workspaceId: page.workspaceId,
  spaceId: null,
  treeId: null,
  parentId: null,
  kind: 'label',
  name: 'Urgent',
  slug: 'urgent',
  tree: null,
} as any;

function createService() {
  const trx = {};
  const db = {
    transaction: jest.fn().mockReturnValue({
      execute: (callback: (transaction: unknown) => unknown) => callback(trx),
    }),
  };
  const labelRepo = {
    findByIdWithTree: jest.fn().mockResolvedValue(freeLabel),
    hasPageLabel: jest.fn().mockResolvedValue(false),
    insertPageLabel: jest.fn().mockResolvedValue(true),
    findLabelsByPageId: jest.fn().mockResolvedValue([freeLabel]),
    findPageTaxonomyAssignment: jest.fn().mockResolvedValue(undefined),
    findPageTaxonomyAssignments: jest.fn().mockResolvedValue([]),
    deletePageLabelAssignment: jest.fn().mockResolvedValue(true),
    findVisible: jest.fn().mockResolvedValue([freeLabel, root, child]),
    findPagesByLabelId: jest.fn().mockResolvedValue({ items: [] }),
    findPagesByTreeId: jest.fn().mockResolvedValue({ items: [] }),
  };
  const labelTreeRepo = {
    findById: jest.fn().mockResolvedValue(tree),
    findByIds: jest.fn().mockResolvedValue([tree]),
    findNodesByTreeIds: jest.fn().mockResolvedValue([root, child]),
    findNodeById: jest.fn().mockResolvedValue(child),
    findAncestors: jest.fn().mockResolvedValue([root, child]),
    findVisible: jest.fn().mockResolvedValue([tree]),
  };
  const labelAudit = {
    logLabelApplied: jest.fn(),
    logTaxonomySelection: jest.fn(),
  };
  const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
  const pageAccessService = {
    validateCanEdit: jest.fn().mockResolvedValue(undefined),
  };
  const service = new LabelService(
    labelRepo as any,
    labelTreeRepo as any,
    labelAudit as any,
    pageRepo as any,
    pageAccessService as any,
    db as any,
  );
  return { service, labelRepo, labelTreeRepo, labelAudit, pageRepo, trx };
}

describe('LabelService', () => {
  it('applies only free labels through the legacy page-label operation', async () => {
    const { service, labelRepo, labelAudit, pageRepo, trx } = createService();

    await expect(service.applyLabel(page, freeLabel.id, user)).resolves.toEqual(
      {
        label: freeLabel,
      },
    );

    expect(pageRepo.findById).toHaveBeenCalledWith(page.id, {
      trx,
      withLock: true,
    });
    expect(labelRepo.insertPageLabel).toHaveBeenCalledWith(
      {
        pageId: page.id,
        labelId: freeLabel.id,
        labelTreeId: null,
        addedById: user.id,
      },
      trx,
    );
    expect(labelAudit.logLabelApplied).toHaveBeenCalledWith(
      page,
      freeLabel,
      user.id,
      undefined,
      trx,
    );
  });

  it('selects one endpoint per tree and replaces the previous path atomically', async () => {
    const { service, labelRepo, labelTreeRepo, labelAudit, trx } =
      createService();
    const previousAssignment = {
      id: 'assignment-1',
      pageId: page.id,
      labelId: root.id,
      labelTreeId: tree.id,
    };
    labelRepo.findPageTaxonomyAssignment.mockResolvedValue(previousAssignment);
    labelTreeRepo.findNodeById.mockResolvedValue(child);
    labelTreeRepo.findAncestors
      .mockResolvedValueOnce([root])
      .mockResolvedValueOnce([root, child]);

    const result = await service.selectTaxonomyPath(
      page,
      tree.id,
      child.id,
      user,
    );

    expect(result.previous?.nodes).toEqual([root]);
    expect(result.current?.selectedNodeId).toBe(child.id);
    expect(labelRepo.deletePageLabelAssignment).toHaveBeenCalledWith(
      previousAssignment.id,
      trx,
    );
    expect(labelRepo.insertPageLabel).toHaveBeenCalledWith(
      {
        pageId: page.id,
        labelId: child.id,
        labelTreeId: tree.id,
        addedById: user.id,
      },
      trx,
    );
    expect(labelAudit.logTaxonomySelection).toHaveBeenCalledWith(
      page,
      expect.objectContaining({ selectedNodeId: root.id }),
      expect.objectContaining({ selectedNodeId: child.id }),
      user.id,
      trx,
    );
  });

  it('allows the tree itself as the endpoint', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    labelRepo.findPageTaxonomyAssignment.mockResolvedValue(undefined);
    labelTreeRepo.findNodeById.mockClear();

    const result = await service.selectTaxonomyPath(page, tree.id, null, user);

    expect(result.current).toEqual({
      tree: expect.objectContaining({ id: tree.id }),
      selectedNodeId: null,
      nodes: [],
    });
    expect(labelTreeRepo.findNodeById).not.toHaveBeenCalled();
  });

  it('rejects a node from another tree', async () => {
    const { service, labelTreeRepo } = createService();
    labelTreeRepo.findNodeById.mockResolvedValue({
      ...child,
      treeId: 'tree-other',
    });

    await expect(
      service.selectTaxonomyPath(page, tree.id, child.id, user),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('hydrates selected paths in one tree/node batch', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    labelRepo.findPageTaxonomyAssignments.mockResolvedValue([
      {
        id: 'assignment-tree',
        pageId: page.id,
        labelId: child.id,
        labelTreeId: tree.id,
      },
      {
        id: 'assignment-root',
        pageId: page.id,
        labelId: null,
        labelTreeId: tree.id,
      },
    ]);

    const result = await service.getPageTaxonomy(page.id);

    expect(result.paths[0].nodes).toEqual([root, child]);
    expect(result.paths[1].nodes).toEqual([]);
    expect(labelTreeRepo.findByIds).toHaveBeenCalledWith([tree.id]);
    expect(labelTreeRepo.findNodesByTreeIds).toHaveBeenCalledWith([tree.id]);
  });

  it('returns a taxonomy label with its tree and root-to-parent ancestors', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    const treeSummary = {
      id: tree.id,
      name: tree.name,
      slug: 'status',
      color: tree.color,
      position: tree.position,
    };
    labelRepo.findByIdWithTree.mockResolvedValue({
      ...child,
      tree: treeSummary,
    });
    labelTreeRepo.findAncestors.mockResolvedValue([root, child]);

    await expect(service.getLabelInfo(child.id)).resolves.toEqual({
      ...child,
      tree: treeSummary,
      targetType: 'label',
      ancestors: [root],
    });

    expect(labelRepo.findByIdWithTree).toHaveBeenCalledWith(child.id);
    expect(labelTreeRepo.findAncestors).toHaveBeenCalledWith(child.id);
  });

  it('returns free labels without a tree or ancestors', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();

    await expect(service.getLabelInfo(freeLabel.id)).resolves.toEqual({
      ...freeLabel,
      targetType: 'label',
      ancestors: [],
    });

    expect(labelTreeRepo.findAncestors).not.toHaveBeenCalled();
  });

  it('returns a group as a label target with its ancestors', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    const treeSummary = {
      id: tree.id,
      name: tree.name,
      slug: 'status',
      color: tree.color,
      position: tree.position,
    };
    labelRepo.findByIdWithTree.mockResolvedValue({
      ...root,
      tree: treeSummary,
    });
    labelTreeRepo.findAncestors.mockResolvedValue([root]);

    await expect(service.getLabelInfo(root.id)).resolves.toEqual({
      ...root,
      tree: treeSummary,
      targetType: 'label',
      ancestors: [],
    });
  });

  it('resolves a tree when the UUID is not a label', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    labelRepo.findByIdWithTree.mockResolvedValue(undefined);
    labelTreeRepo.findById.mockResolvedValue(tree);

    await expect(service.getLabelInfo(tree.id)).resolves.toEqual({
      ...tree,
      targetType: 'tree',
      ancestors: [],
    });

    expect(labelRepo.findByIdWithTree).toHaveBeenCalledWith(tree.id);
    expect(labelTreeRepo.findById).toHaveBeenCalledWith(tree.id);
    expect(labelTreeRepo.findAncestors).not.toHaveBeenCalled();
  });

  it('returns no target for an unknown UUID', async () => {
    const { service, labelRepo, labelTreeRepo } = createService();
    labelRepo.findByIdWithTree.mockResolvedValue(undefined);
    labelTreeRepo.findById.mockResolvedValue(undefined);

    await expect(service.getLabelInfo('missing')).resolves.toBeUndefined();
  });

  it('uses tree assignments when listing pages for a tree target', async () => {
    const { service, labelRepo } = createService();
    const options = { pagination: {} as any };

    await service.findPagesByLabel(tree.id, user.id, options, 'tree');

    expect(labelRepo.findPagesByTreeId).toHaveBeenCalledWith(
      tree.id,
      user.id,
      options,
    );
    expect(labelRepo.findPagesByLabelId).not.toHaveBeenCalled();
  });
});
