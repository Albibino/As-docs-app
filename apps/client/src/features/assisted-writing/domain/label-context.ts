import type {
  IAvailableLabels,
  ILabel,
  IPageTaxonomy,
} from "@/features/label/types/label.types.ts";

export function getPageLabelNames(data: IPageTaxonomy | undefined): string[] {
  if (!data) return [];

  const taxonomyLabels = data.paths.map((path) => {
    const selectedNode = path.nodes[path.nodes.length - 1];
    return selectedNode?.name ?? path.tree.name;
  });

  return [
    ...taxonomyLabels,
    ...data.freeLabels.map((label) => label.name),
  ];
}

export function getAvailableLabelNames(
  data: IAvailableLabels | undefined,
): string[] {
  if (!data) return [];

  return [
    ...data.trees.flatMap((tree) => tree.nodes.map((node) => node.name)),
    ...data.freeLabels.map((label) => label.name),
  ];
}

export function findFreePageLabelByName(
  data: IPageTaxonomy | undefined,
  name: string,
): ILabel | undefined {
  const normalizedName = name.toLowerCase();
  return data?.freeLabels.find(
    (label) => label.name.toLowerCase() === normalizedName,
  );
}
