import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { searchPage } from "@/features/search/services/search-service";
import {
  IPageSearch,
  IPageSearchParams,
} from "@/features/search/types/search.types";

export function useUnifiedSearch(
  params: IPageSearchParams,
): UseQueryResult<IPageSearch[], Error> {
  return useQuery({
    queryKey: ["unified-search", "page", params],
    queryFn: () => searchPage(params),
    enabled: !!params.query,
  });
}
