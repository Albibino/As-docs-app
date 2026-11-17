import { useQuery, UseQueryResult } from "@tanstack/react-query";
import { getMyInfo } from "@/features/user/services/user-service";
import { ICurrentUser } from "@/features/user/types/user.types";

export function useCurrentUser(options?: {
  enabled?: boolean;
}): UseQueryResult<ICurrentUser> {
  return useQuery({
    queryKey: ["currentUser"],
    queryFn: async () => {
      return await getMyInfo();
    },
    enabled: options?.enabled ?? true,
  });
}

export default useCurrentUser;
