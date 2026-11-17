import { NotFoundException } from '@nestjs/common';
import { LabelController } from './label.controller';

const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;
const tree = {
  id: 'tree-status',
  targetType: 'tree' as const,
  workspaceId: workspace.id,
  spaceId: 'space-1',
  name: 'Status',
  slug: 'status',
  color: 'blue',
  position: 0,
  description: null,
  createdById: null,
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
  ancestors: [],
};

function createController() {
  const labelService = {
    getLabelInfo: jest.fn().mockResolvedValue(tree),
    findPagesByLabel: jest.fn().mockResolvedValue({ items: [] }),
  };
  const labelPermission = {
    assertCanReadSpace: jest.fn().mockResolvedValue(undefined),
  };
  const controller = new LabelController(
    labelService as any,
    {} as any,
    labelPermission as any,
    {} as any,
  );
  return { controller, labelService, labelPermission };
}

describe('LabelController tree targets', () => {
  it('checks access to a space-scoped tree in the info endpoint', async () => {
    const { controller, labelPermission } = createController();

    await expect(
      controller.getLabelInfo({ labelId: tree.id }, user, workspace),
    ).resolves.toEqual(tree);

    expect(labelPermission.assertCanReadSpace).toHaveBeenCalledWith(
      user,
      workspace,
      tree.spaceId,
    );
  });

  it('checks access to a space-scoped tree before listing its pages', async () => {
    const { controller, labelService, labelPermission } = createController();
    const pagination = { limit: 25, query: '', adminView: false } as any;

    await controller.findPagesByLabel(
      { labelId: tree.id },
      pagination,
      user,
      workspace,
    );

    expect(labelPermission.assertCanReadSpace).toHaveBeenCalledWith(
      user,
      workspace,
      tree.spaceId,
    );
    expect(labelService.findPagesByLabel).toHaveBeenCalledWith(
      tree.id,
      user.id,
      {
        spaceId: undefined,
        query: pagination.query,
        pagination,
      },
      'tree',
    );
  });

  it('hides a tree from another workspace', async () => {
    const { controller } = createController();

    await expect(
      controller.getLabelInfo({ labelId: tree.id }, user, {
        id: 'workspace-2',
      } as any),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
