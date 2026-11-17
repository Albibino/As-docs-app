import { Center, Loader } from "@mantine/core";
import { IconAlertCircle, IconUsersGroup } from "@tabler/icons-react";
import { useAtomValue } from "jotai";
import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { useCurrentUser } from "@/features/user/hooks/use-current-user";
import { useTeamsQuery } from "@/features/team/queries/team-query";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { getSpaceUrl } from "@/lib/config";
import {
  readLastDocsContext,
  rememberLastDocsContext,
  resolveDocsEntryTarget,
} from "@/features/home/navigation/docs-entry";
import { UserRole } from "@/lib/types";
import { EmptyState } from "@/components/ui/empty-state";

export default function DocsEntryRedirect() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const storedUser = useAtomValue(currentUserAtom);
  const { data: userData } = useCurrentUser();
  const user = userData ?? storedUser;
  const isWorkspaceAdmin =
    user?.user.role === UserRole.OWNER || user?.user.role === UserRole.ADMIN;
  const shouldLoadTeams = Boolean(user) && !isWorkspaceAdmin;
  const teamsQuery = useTeamsQuery({ limit: 100 }, shouldLoadTeams);
  const teams = teamsQuery.data?.items ?? [];
  const hasAdministratedTeam = teams.some((team) => team.isAdmin);
  const shouldLoadSpaces =
    Boolean(user) &&
    !isWorkspaceAdmin &&
    !teamsQuery.isPending &&
    !hasAdministratedTeam;
  const spacesQuery = useGetSpacesQuery({ limit: 100 }, shouldLoadSpaces);
  const spaces = spacesQuery.data?.items ?? [];
  const target = useMemo(() => {
    if (
      !user ||
      isWorkspaceAdmin ||
      teamsQuery.isPending ||
      teamsQuery.isError ||
      (shouldLoadSpaces && (spacesQuery.isPending || spacesQuery.isError))
    ) {
      return null;
    }

    return resolveDocsEntryTarget({
      isWorkspaceAdmin: false,
      teams,
      spaces,
      lastContext: readLastDocsContext(user.workspace.id, user.user.id),
    });
  }, [
    isWorkspaceAdmin,
    shouldLoadSpaces,
    spaces,
    spacesQuery.isError,
    spacesQuery.isPending,
    teams,
    teamsQuery.isError,
    teamsQuery.isPending,
    user,
  ]);

  useEffect(() => {
    if (!user) return;

    if (isWorkspaceAdmin) {
      navigate("/home", { replace: true });
      return;
    }

    if (!target) return;

    switch (target.kind) {
      case "team-directory":
        break;
      case "team-spaces":
        navigate(`/spaces?teamId=${encodeURIComponent(target.teamId)}`, {
          replace: true,
        });
        break;
      case "space":
        rememberLastDocsContext({
          workspaceId: user.workspace.id,
          userId: user.user.id,
          context: {
            teamId: target.teamId,
            spaceSlug: target.spaceSlug,
          },
          teams,
          spaces,
        });
        navigate(getSpaceUrl(target.spaceSlug), { replace: true });
        break;
      case "empty":
        break;
    }
  }, [
    isWorkspaceAdmin,
    navigate,
    spaces,
    target,
    teams,
    user,
  ]);

  const loadError = !isWorkspaceAdmin && teamsQuery.isError
    ? t("Unable to load teams")
    : shouldLoadSpaces && spacesQuery.isError
      ? t("Unable to load spaces")
      : null;

  if (loadError) {
    return (
      <Center mih="60vh" role="alert">
        <EmptyState icon={IconAlertCircle} title={loadError} />
      </Center>
    );
  }

  if (target?.kind === "empty") {
    return (
      <Center mih="60vh" role="status" aria-live="polite">
        <EmptyState
          icon={IconUsersGroup}
          title={t("No accessible spaces")}
          description={t(
            "Ask a workspace or team administrator to give you access.",
          )}
        />
      </Center>
    );
  }

  return (
    <Center mih="60vh" role="status" aria-live="polite">
      <Loader size="sm" aria-label={t("Loading")} />
    </Center>
  );
}
