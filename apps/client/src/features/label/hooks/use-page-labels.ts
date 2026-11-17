import { useCallback, useMemo } from "react";
import {
  useApplyLabelMutation,
  useCreatePageLabelMutation,
  usePageLabelsQuery,
  useRemovePageLabelMutation,
  useRemoveTaxonomyMutation,
  useSelectTaxonomyMutation,
} from "@/features/label/queries/label-query.ts";
import {
  IPageLabelDisplay,
  IPageTaxonomy,
} from "@/features/label/types/label.types.ts";

function toDisplayLabels(data: IPageTaxonomy | undefined): IPageLabelDisplay[] {
  if (!data) return [];

  const freeLabels = data.freeLabels.map((label) => ({
    id: label.id,
    name: label.name,
    color: label.color,
    treeId: null,
    tree: null,
    path: label.name,
    taxonomy: false,
  }));

  const taxonomyLabels = data.paths.map((path) => {
    const selected = path.nodes[path.nodes.length - 1];
    if (selected) {
      return {
        id: selected.id,
        name: selected.name,
        color: selected.color ?? path.tree.color,
        treeId: path.tree.id,
        tree: path.tree,
        path: [path.tree.name, ...path.nodes.map((node) => node.name)].join(
          " / ",
        ),
        taxonomy: true,
        hierarchyDepth: Math.max(path.nodes.length - 1, 0),
      };
    }
    return {
      id: `tree:${path.tree.id}`,
      name: path.tree.name,
      color: path.tree.color,
      treeId: path.tree.id,
      tree: path.tree,
      path: path.tree.name,
      taxonomy: true,
      hierarchyDepth: 0,
    };
  });

  return [...taxonomyLabels, ...freeLabels];
}

export function usePageLabels(pageId: string | undefined) {
  const { data, isLoading } = usePageLabelsQuery(pageId);
  const applyMutation = useApplyLabelMutation(pageId);
  const selectMutation = useSelectTaxonomyMutation(pageId);
  const removeTaxonomyMutation = useRemoveTaxonomyMutation(pageId);
  const createMutation = useCreatePageLabelMutation(pageId);
  const removeMutation = useRemovePageLabelMutation(pageId);

  const labels = useMemo(() => toDisplayLabels(data), [data]);

  const apply = useCallback(
    (labelId: string) => {
      if (!pageId) return;
      applyMutation.mutate({ pageId, labelId });
    },
    [pageId, applyMutation],
  );

  const select = useCallback(
    (treeId: string, nodeId: string | null) => {
      if (!pageId) return;
      selectMutation.mutate({ pageId, treeId, nodeId });
    },
    [pageId, selectMutation],
  );

  const create = useCallback(
    (name: string) => {
      if (!pageId) return;
      createMutation.mutate({ pageId, name });
    },
    [pageId, createMutation],
  );

  const remove = useCallback(
    (label: Pick<IPageLabelDisplay, "id" | "treeId" | "taxonomy">) => {
      if (!pageId) return;
      if (label.taxonomy && label.treeId) {
        removeTaxonomyMutation.mutate({ pageId, treeId: label.treeId });
      } else {
        removeMutation.mutate({ pageId, labelId: label.id });
      }
    },
    [pageId, removeMutation, removeTaxonomyMutation],
  );

  return { labels, isLoading, apply, select, create, remove };
}
