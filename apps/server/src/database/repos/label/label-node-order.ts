export type LabelNodeOrderItem = {
  id: string;
  position: number;
  name: string;
};

export function reorderSiblingIds(
  siblings: readonly LabelNodeOrderItem[],
  nodeId: string,
  requestedPosition: number,
): string[] {
  const ordered = [...siblings].sort(
    (left, right) =>
      Number(left.position) - Number(right.position) ||
      left.name.localeCompare(right.name),
  );
  const sourceIndex = ordered.findIndex((sibling) => sibling.id === nodeId);
  if (sourceIndex === -1) throw new Error('Label node is not a sibling');

  const [source] = ordered.splice(sourceIndex, 1);
  const targetIndex = Math.max(
    0,
    Math.min(Math.trunc(requestedPosition), ordered.length),
  );
  ordered.splice(targetIndex, 0, source);
  return ordered.map((sibling) => sibling.id);
}
