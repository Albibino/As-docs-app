import { queryClient } from "@/main.tsx";
import { getSpaces } from "@/features/space/services/space-service.ts";
import { QueryParams } from "@/lib/types.ts";
import { getWorkspaceMembers } from "@/features/workspace/services/workspace-service.ts";
import { getTeams } from "@/features/team/services/team-service.ts";

export const prefetchWorkspaceMembers = () => {
  const params: QueryParams = { limit: 100, query: "" };
  queryClient.prefetchQuery({
    queryKey: ["workspaceMembers", params],
    queryFn: () => getWorkspaceMembers(params),
  });
};

export const prefetchSpaces = () => {
  queryClient.prefetchQuery({
    queryKey: ["spaces", {}],
    queryFn: () => getSpaces({}),
  });
};

export const prefetchTeams = () => {
  queryClient.prefetchQuery({
    queryKey: ["teams", {}],
    queryFn: () => getTeams({}),
  });
};
