import { Center, Loader } from "@mantine/core";
import { Navigate } from "react-router-dom";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { useTeamsQuery } from "@/features/team/queries/team-query";
import { UserRole } from "@/lib/types";

type TeamManagementRouteProps = { children: React.ReactNode };

/** Allows workspace administrators and administrators of at least one team. */
export function TeamManagementRoute({ children }: TeamManagementRouteProps) {
  const { data: currentUser, isLoading: userLoading } = useCurrentUser();
  const { data: teams, isLoading: teamsLoading } = useTeamsQuery({ limit: 100 });
  const role = currentUser?.user?.role;
  const isWorkspaceAdmin = role === UserRole.OWNER || role === UserRole.ADMIN;

  if (userLoading || (!isWorkspaceAdmin && teamsLoading)) {
    return <Center h="100%"><Loader size="sm" /></Center>;
  }

  return isWorkspaceAdmin || teams?.items.some((team) => team.isAdmin)
    ? children
    : <Navigate to="/home" replace />;
}
