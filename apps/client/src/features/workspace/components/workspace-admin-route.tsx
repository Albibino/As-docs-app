import { Center, Loader } from "@mantine/core";
import { Navigate } from "react-router-dom";
import useCurrentUser from "@/features/user/hooks/use-current-user";
import { UserRole } from "@/lib/types";

type WorkspaceAdminRouteProps = {
  children: React.ReactNode;
};

export function WorkspaceAdminRoute({
  children,
}: WorkspaceAdminRouteProps) {
  const { data: currentUser, isLoading } = useCurrentUser();

  if (isLoading) {
    return (
      <Center h="100%">
        <Loader size="sm" />
      </Center>
    );
  }

  const role = currentUser?.user?.role;
  const isWorkspaceAdmin =
    role === UserRole.OWNER || role === UserRole.ADMIN;

  return isWorkspaceAdmin ? children : <Navigate to="/home" replace />;
}
