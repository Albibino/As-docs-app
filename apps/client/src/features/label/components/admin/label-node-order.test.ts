import {
  getSiblingDropPosition,
  getSiblingMovePosition,
  canReorderLabelNodes,
} from './label-node-order';

const parent = { treeId: 'tree-1', parentId: 'parent-1' };
const siblings = ['erp', 'hcm', 'finance'];

describe('label node sibling ordering', () => {
  it('calculates arrow positions within the sibling list', () => {
    expect(getSiblingMovePosition(0, siblings.length, 'down')).toBe(1);
    expect(getSiblingMovePosition(2, siblings.length, 'up')).toBe(1);
    expect(getSiblingMovePosition(0, siblings.length, 'up')).toBe(0);
    expect(getSiblingMovePosition(2, siblings.length, 'down')).toBe(2);
  });

  it('calculates before and after positions after removing the source', () => {
    expect(getSiblingDropPosition(siblings, 'erp', 'finance', 'top')).toBe(1);
    expect(getSiblingDropPosition(siblings, 'erp', 'finance', 'bottom')).toBe(2);
    expect(getSiblingDropPosition(siblings, 'finance', 'erp', 'top')).toBe(0);
  });

  it('allows drops only between nodes with the same parent and tree', () => {
    expect(
      canReorderLabelNodes(
        { id: 'erp', ...parent },
        { id: 'hcm', ...parent },
      ),
    ).toBe(true);
    expect(
      canReorderLabelNodes(
        { id: 'erp', ...parent },
        { id: 'hcm', treeId: 'tree-2', parentId: 'parent-1' },
      ),
    ).toBe(false);
    expect(
      canReorderLabelNodes(
        { id: 'erp', ...parent },
        { id: 'hcm', treeId: 'tree-1', parentId: 'other-parent' },
      ),
    ).toBe(false);
  });
});
