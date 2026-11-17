import {
  keepPreviousData,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  applyPageLabel,
  createLabel,
  createLabelNode,
  createLabelTree,
  createPageLabel,
  deleteLabel,
  deleteLabelNode,
  deleteLabelTree,
  findPagesByLabel,
  getAvailableLabels,
  getLabelInfo,
  getLabelNodeImpact,
  getLabelTreeImpact,
  getMoveLabelNodeImpact,
  getOwnedLabels,
  getPageLabelHistory,
  getPageLabels,
  getSearchableLabels,
  moveLabelNode,
  removePageLabel,
  removePageTaxonomy,
  selectPageTaxonomy,
  updateLabel,
  updateLabelNode,
  updateLabelTree,
} from "@/features/label/services/label-service.ts";
import {
  IAvailableLabels,
  ICreateLabelNodeParams,
  ICreateLabelParams,
  ICreateLabelTreeParams,
  ICreatePageLabelParams,
  ILabel,
  ILabelHistoryEntry,
  ILabelInfo,
  ILabelNode,
  ILabelTree,
  IPageLabelParams,
  IPageTaxonomy,
  IRemoveTaxonomyParams,
  IMoveLabelNodeImpact,
  IMoveLabelNodeParams,
  INodeImpact,
  ISelectTaxonomyParams,
  ITreeImpact,
  IUpdateLabelNodeParams,
  IUpdateLabelParams,
  IUpdateLabelTreeParams,
} from "@/features/label/types/label.types.ts";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { translateLabelApiError } from "@/features/label/utils/translate-label-error";

const PAGE_LABELS_KEY = (pageId: string) => ["page-labels", pageId];
const AVAILABLE_LABELS_KEY = (spaceId: string) => ["available-labels", spaceId];
const OWNED_LABELS_KEY = (spaceId?: string) => ["owned-labels", spaceId ?? ""];

export function usePageLabelsQuery(pageId: string | undefined) {
  return useQuery<IPageTaxonomy>({
    queryKey: PAGE_LABELS_KEY(pageId ?? ""),
    queryFn: () => getPageLabels(pageId as string),
    enabled: !!pageId,
  });
}

export function useAvailableLabelsQuery(
  spaceId: string | undefined,
  enabled = true,
) {
  return useQuery<IAvailableLabels>({
    queryKey: AVAILABLE_LABELS_KEY(spaceId ?? ""),
    queryFn: () => getAvailableLabels({ spaceId: spaceId as string }),
    enabled: enabled && !!spaceId,
    staleTime: 60 * 1000,
  });
}

function invalidatePageLabelViews(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  queryClient.invalidateQueries({ queryKey: ["page-labels"] });
  queryClient.invalidateQueries({ queryKey: ["page-label-history"] });
  queryClient.invalidateQueries({ queryKey: ["label-pages"] });
  queryClient.invalidateQueries({ queryKey: ["page-search"] });
  queryClient.invalidateQueries({ queryKey: ["unified-search"] });
  queryClient.invalidateQueries({ queryKey: ["base-rows"] });
  queryClient.invalidateQueries({ queryKey: ["base-aggregate"] });
}

export function useApplyLabelMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<ILabel, Error, IPageLabelParams>({
    mutationFn: applyPageLabel,
    onSuccess: () => invalidatePageLabelViews(queryClient),
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(error, t, i18n, "Failed to add label"),
        color: "red",
      }),
  });
}

export function useSelectTaxonomyMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<void, Error, ISelectTaxonomyParams>({
    mutationFn: selectPageTaxonomy,
    onSuccess: () => invalidatePageLabelViews(queryClient),
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(
          error,
          t,
          i18n,
          "Failed to update taxonomy",
        ),
        color: "red",
      }),
  });
}

export function useRemoveTaxonomyMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<void, Error, IRemoveTaxonomyParams>({
    mutationFn: removePageTaxonomy,
    onSuccess: () => invalidatePageLabelViews(queryClient),
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(
          error,
          t,
          i18n,
          "Failed to remove taxonomy selection",
        ),
        color: "red",
      }),
  });
}

export function useCreatePageLabelMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<ILabel, Error, ICreatePageLabelParams>({
    mutationFn: createPageLabel,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["available-labels"] });
      queryClient.invalidateQueries({ queryKey: ["searchable-labels"] });
      invalidatePageLabelViews(queryClient);
    },
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(error, t, i18n, "Failed to add label"),
        color: "red",
      }),
  });
}

export function useRemovePageLabelMutation(pageId: string | undefined) {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<void, Error, IPageLabelParams>({
    mutationFn: removePageLabel,
    onSuccess: () => invalidatePageLabelViews(queryClient),
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(
          error,
          t,
          i18n,
          "Failed to remove label",
        ),
        color: "red",
      }),
  });
}

export function usePageLabelHistoryQuery(
  pageId: string | undefined,
  enabled = true,
) {
  return useQuery({
    queryKey: ["page-label-history", pageId ?? ""],
    queryFn: () => getPageLabelHistory(pageId as string),
    enabled: enabled && !!pageId,
  });
}

export function useSearchableLabelsQuery(enabled = true) {
  return useQuery({
    queryKey: ["searchable-labels"],
    queryFn: getSearchableLabels,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

function useTaxonomyInvalidation(spaceId?: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: OWNED_LABELS_KEY(spaceId) });
    queryClient.invalidateQueries({ queryKey: ["available-labels"] });
    queryClient.invalidateQueries({ queryKey: ["searchable-labels"] });
    queryClient.invalidateQueries({ queryKey: ["page-labels"] });
    queryClient.invalidateQueries({ queryKey: ["page-label-history"] });
    queryClient.invalidateQueries({ queryKey: ["label-pages"] });
    queryClient.invalidateQueries({ queryKey: ["label-info"] });
    queryClient.invalidateQueries({ queryKey: ["page-search"] });
    queryClient.invalidateQueries({ queryKey: ["unified-search"] });
    queryClient.invalidateQueries({ queryKey: ["bases"] });
    queryClient.invalidateQueries({ queryKey: ["base-rows"] });
    queryClient.invalidateQueries({ queryKey: ["base-aggregate"] });
  };
}

function useTaxonomyMutation<TData, TVars>(
  mutationFn: (vars: TVars) => Promise<TData>,
  spaceId: string | undefined,
  fallbackKey: string,
) {
  const invalidate = useTaxonomyInvalidation(spaceId);
  const { t, i18n } = useTranslation();
  return useMutation<TData, Error, TVars>({
    mutationFn,
    onSuccess: invalidate,
    onError: (error: any) =>
      notifications.show({
        message: translateLabelApiError(error, t, i18n, fallbackKey),
        color: "red",
      }),
  });
}

export function useOwnedLabelsQuery(spaceId?: string, enabled = true) {
  return useQuery<IAvailableLabels>({
    queryKey: OWNED_LABELS_KEY(spaceId),
    queryFn: () => getOwnedLabels({ spaceId }),
    enabled,
  });
}

export function useCreateLabelTreeMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabelTree, ICreateLabelTreeParams>(
    createLabelTree,
    spaceId,
    "Failed to create label tree",
  );
}

export function useUpdateLabelTreeMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabelTree, IUpdateLabelTreeParams>(
    updateLabelTree,
    spaceId,
    "Failed to update label tree",
  );
}

export function useDeleteLabelTreeMutation(spaceId?: string) {
  return useTaxonomyMutation<void, string>(
    deleteLabelTree,
    spaceId,
    "Failed to delete label tree",
  );
}

export function useCreateLabelNodeMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabelNode, ICreateLabelNodeParams>(
    createLabelNode,
    spaceId,
    "Failed to create label node",
  );
}

export function useUpdateLabelNodeMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabelNode, IUpdateLabelNodeParams>(
    updateLabelNode,
    spaceId,
    "Failed to update label node",
  );
}

export function useMoveLabelNodeMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabelNode, IMoveLabelNodeParams>(
    moveLabelNode,
    spaceId,
    "Failed to move label node",
  );
}

export function useDeleteLabelNodeMutation(spaceId?: string) {
  return useTaxonomyMutation<void, string>(
    deleteLabelNode,
    spaceId,
    "Failed to delete label node",
  );
}

export function useCreateLabelMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabel, ICreateLabelParams>(
    createLabel,
    spaceId,
    "Failed to create label",
  );
}

export function useUpdateLabelMutation(spaceId?: string) {
  return useTaxonomyMutation<ILabel, IUpdateLabelParams>(
    updateLabel,
    spaceId,
    "Failed to update label",
  );
}

export function useDeleteLabelMutation(spaceId?: string) {
  return useTaxonomyMutation<void, string>(
    deleteLabel,
    spaceId,
    "Failed to delete label",
  );
}

export function useLabelTreeImpactQuery(treeId: string | undefined) {
  return useQuery<ITreeImpact>({
    queryKey: ["label-tree-impact", treeId ?? ""],
    queryFn: () => getLabelTreeImpact(treeId as string),
    enabled: !!treeId,
  });
}

export function useLabelNodeImpactQuery(nodeId: string | undefined) {
  return useQuery<INodeImpact>({
    queryKey: ["label-node-impact", nodeId ?? ""],
    queryFn: () => getLabelNodeImpact(nodeId as string),
    enabled: !!nodeId,
  });
}

export function useMoveLabelNodeImpactMutation() {
  return useMutation<IMoveLabelNodeImpact, Error, IMoveLabelNodeParams>({
    mutationFn: getMoveLabelNodeImpact,
  });
}

export function useLabelInfoQuery(labelId: string | undefined) {
  return useQuery<ILabelInfo>({
    queryKey: ["label-info", labelId ?? ""],
    queryFn: () => getLabelInfo(labelId as string),
    enabled: !!labelId,
  });
}

const LABEL_PAGES_LIMIT = 25;

export function useLabelPagesQuery(
  labelId: string | undefined,
  query: string,
  spaceId?: string,
) {
  return useInfiniteQuery({
    queryKey: ["label-pages", labelId ?? "", query, spaceId ?? ""],
    queryFn: ({ pageParam }) =>
      findPagesByLabel({
        labelId: labelId as string,
        query,
        spaceId,
        cursor: pageParam,
        limit: LABEL_PAGES_LIMIT,
      }),
    enabled: !!labelId,
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) =>
      lastPage.meta.hasNextPage
        ? (lastPage.meta.nextCursor ?? undefined)
        : undefined,
    placeholderData: keepPreviousData,
  });
}

export type { IAvailableLabels };
