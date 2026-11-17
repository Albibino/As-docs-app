import {
  InfiniteData,
  useInfiniteQuery,
  useMutation,
  UseInfiniteQueryResult,
  useQuery,
  UseQueryResult,
} from "@tanstack/react-query";
import {
  getPageHistoryById,
  getPageHistoryList,
  prepareHistoryRestore,
} from "@/features/page-history/services/page-history-service";
import {
  IPageHistory,
  IPageHistoryList,
  IPrepareHistoryRestoreInput,
  IPrepareHistoryRestoreResult,
} from "@/features/page-history/types/page.types";
import { queryClient } from "@/main";

const HISTORY_STALE_TIME = 60 * 60 * 1000;

export function prefetchPageHistory(historyId: string) {
  return queryClient.prefetchQuery({
    queryKey: ["page-history", historyId],
    queryFn: () => getPageHistoryById(historyId),
    staleTime: HISTORY_STALE_TIME,
  });
}

export function usePageHistoryListQuery(
  pageId: string,
): UseInfiniteQueryResult<InfiniteData<IPageHistoryList, unknown>> {
  return useInfiniteQuery({
    queryKey: ["page-history-list", pageId],
    queryFn: ({ pageParam }) => getPageHistoryList(pageId, pageParam),
    enabled: !!pageId,
    gcTime: 0,
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.meta?.nextCursor ?? undefined,
  });
}

export function usePageHistoryQuery(
  historyId?: string,
): UseQueryResult<IPageHistory, Error> {
  return useQuery({
    queryKey: ["page-history", historyId],
    queryFn: () => getPageHistoryById(historyId),
    enabled: !!historyId,
    staleTime: HISTORY_STALE_TIME,
  });
}

export function usePrepareHistoryRestoreMutation() {
  return useMutation<
    IPrepareHistoryRestoreResult,
    Error,
    IPrepareHistoryRestoreInput
  >({
    mutationFn: prepareHistoryRestore,
    onSuccess: async ({ snapshot }) => {
      queryClient.setQueryData(["page-history", snapshot.id], snapshot);
      await queryClient.invalidateQueries({
        queryKey: ["page-history-list", snapshot.pageId],
      });
    },
  });
}
