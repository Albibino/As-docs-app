import type {
  IAvailableTaxonomyTree,
  ILabelNode,
} from "@/features/label/types/label.types.ts";

export type SearchLabelOption = {
  id: string;
  displayName: string;
  searchText: string;
};

const compareLabelNodes = (left: ILabelNode, right: ILabelNode) => {
  const leftCreatedAt = Date.parse(left.createdAt);
  const rightCreatedAt = Date.parse(right.createdAt);

  if (Number.isFinite(leftCreatedAt) && Number.isFinite(rightCreatedAt)) {
    if (leftCreatedAt !== rightCreatedAt) return leftCreatedAt - rightCreatedAt;
  } else if (
    Number.isFinite(leftCreatedAt) !== Number.isFinite(rightCreatedAt)
  ) {
    return Number.isFinite(leftCreatedAt) ? -1 : 1;
  } else if (left.createdAt !== right.createdAt) {
    return left.createdAt < right.createdAt ? -1 : 1;
  }

  if (left.position !== right.position) return left.position - right.position;

  const byName = left.name.localeCompare(right.name);
  if (byName !== 0) return byName;

  return left.id.localeCompare(right.id);
};

/**
 * Orders a taxonomy tree by registration time and flattens it in pre-order.
 * Missing parents and malformed cyclic branches are surfaced as roots so that
 * a legacy node never disappears from the global search filter.
 */
export function flattenSearchLabelTree(
  tree: IAvailableTaxonomyTree,
): SearchLabelOption[] {
  const nodes = [...(tree.nodes ?? [])];
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const childrenByParent = new Map<string | null, ILabelNode[]>();

  for (const node of nodes) {
    const children = childrenByParent.get(node.parentId) ?? [];
    children.push(node);
    childrenByParent.set(node.parentId, children);
  }

  for (const children of childrenByParent.values()) {
    children.sort(compareLabelNodes);
  }

  const options: SearchLabelOption[] = [];
  const visited = new Set<string>();
  const visit = (node: ILabelNode, ancestors: string[]) => {
    if (visited.has(node.id)) return;
    visited.add(node.id);

    const path = [...ancestors, node.name].join(" / ");
    options.push({
      id: node.id,
      displayName: path,
      searchText: `${tree.name} / ${path}`,
    });

    for (const child of childrenByParent.get(node.id) ?? []) {
      visit(child, [...ancestors, node.name]);
    }
  };

  const roots = nodes
    .filter((node) => node.parentId === null || !byId.has(node.parentId))
    .sort(compareLabelNodes);
  for (const root of roots) visit(root, []);

  // A cycle has no structural root. Starting the remaining components in the
  // deterministic sibling order prevents recursion from hiding those nodes.
  for (const node of nodes.sort(compareLabelNodes)) {
    visit(node, []);
  }

  return options;
}
