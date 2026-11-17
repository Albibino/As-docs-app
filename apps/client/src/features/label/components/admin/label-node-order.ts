export type LabelDropEdge = 'top' | 'bottom';
export type LabelNodeOrderingNode = {
  id: string;
  treeId: string;
  parentId: string | null;
};

export function getSiblingMovePosition(
  currentPosition: number,
  siblingCount: number,
  direction: 'up' | 'down',
): number {
  const lastPosition = Math.max(0, siblingCount - 1);
  const nextPosition = currentPosition + (direction === 'up' ? -1 : 1);
  return Math.max(0, Math.min(nextPosition, lastPosition));
}

export function getSiblingDropPosition(
  siblingIds: readonly string[],
  sourceId: string,
  targetId: string,
  edge: LabelDropEdge,
): number | null {
  if (sourceId === targetId) return null;
  const remaining = siblingIds.filter((id) => id !== sourceId);
  const targetPosition = remaining.indexOf(targetId);
  if (targetPosition === -1) return null;
  return edge === 'top' ? targetPosition : targetPosition + 1;
}

export function canReorderLabelNodes(
  source: LabelNodeOrderingNode,
  target: LabelNodeOrderingNode,
): boolean {
  return (
    source.id !== target.id &&
    source.treeId === target.treeId &&
    source.parentId === target.parentId
  );
}
