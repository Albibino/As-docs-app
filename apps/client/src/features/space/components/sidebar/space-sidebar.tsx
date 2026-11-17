import {
  ActionIcon,
  Divider,
  Group,
  Menu,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import {
  IconArrowDown,
  IconDots,
  IconEye,
  IconEyeOff,
  IconFileExport,
  IconFiles,
  IconHome,
  IconPlus,
  IconSearch,
  IconSettings,
  IconStar,
  IconStarFilled,
  IconTrash,
} from "@tabler/icons-react";
import {
  useSpaceWatchStatusQuery,
  useWatchSpaceMutation,
  useUnwatchSpaceMutation,
} from "@/features/space/queries/space-watcher-query.ts";
import classes from "./space-sidebar.module.css";
import React from "react";
import { useAtom, useAtomValue } from "jotai";
import { useTreeMutation } from "@/features/page/tree/hooks/use-tree-mutation.ts";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { useDisclosure } from "@mantine/hooks";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { getSpaceSettingsUrl, getSpaceUrl } from "@/lib/config.ts";
import SpaceTree from "@/features/page/tree/components/space-tree.tsx";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import PageImportModal from "@/features/page/components/page-import-modal.tsx";
import { useTranslation } from "react-i18next";
import { TeamSwitcher } from "@/features/team/components/team-switcher";
import { SpaceSwitcher } from "./space-switcher";
import { useTeamsQuery } from "@/features/team/queries/team-query";
import ExportModal from "@/components/common/export-modal";
import {
  useFavoriteIds,
  useAddFavoriteMutation,
  useRemoveFavoriteMutation,
} from "@/features/favorite/queries/favorite-query";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { searchSpotlight } from "@/features/search/constants";
import {
  SidebarFavorites,
  SidebarFavoritesCollapsed,
} from "@/features/favorite/components/sidebar-favorites";
import { CollapsedSectionPopover } from "@/components/layouts/global/collapsed-section-popover";
import { LocalPageGraph } from "@/features/page-graph/components/local-page-graph";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom";
import { rememberLastDocsContext } from "@/features/home/navigation/docs-entry";
import { useTeamQuery } from "@/features/team/queries/team-query";

export function SpaceSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

  const { spaceSlug } = useParams();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug);
  const currentUser = useAtomValue(currentUserAtom);
  const { data: team } = useTeamQuery(space?.teamId);
  const teamsQuery = useTeamsQuery({ limit: 100 });
  const [pendingTeamId, setPendingTeamId] = React.useState<string>();
  const [spaceSwitcherOpened, setSpaceSwitcherOpened] = React.useState(false);

  React.useEffect(() => {
    if (space && currentUser && team) {
      rememberLastDocsContext({
        workspaceId: currentUser.workspace.id,
        userId: currentUser.user.id,
        context: { teamId: space.teamId, spaceSlug: space.slug },
        teams: [team],
        spaces: [space],
      });
    }
  }, [currentUser, space, team]);

  React.useEffect(() => {
    if (pendingTeamId && pendingTeamId === space?.teamId) {
      setPendingTeamId(undefined);
      setSpaceSwitcherOpened(false);
    }
  }, [pendingTeamId, space?.teamId]);

  const spaceAbility = useSpaceAbility(space?.permission);
  const canManageSpaceSettings = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Settings,
  );
  const { handleCreate } = useTreeMutation(space?.id ?? "");

  if (!space) {
    return <></>;
  }

  function openSettings() {
    navigate(getSpaceSettingsUrl(space.slug), {
      state: { settingsOrigin: location.pathname },
    });
  }

  function handleCreatePage() {
    handleCreate(null);
  }

  function handleTeamChange(teamId: string) {
    const isCurrentTeam = teamId === space.teamId;
    setPendingTeamId(isCurrentTeam ? undefined : teamId);
    setSpaceSwitcherOpened(!isCurrentTeam);
  }

  function cancelPendingTeamChange() {
    setPendingTeamId(undefined);
    setSpaceSwitcherOpened(false);
  }

  return (
    <>
      <div className={classes.navbar} data-collapsed={collapsed || undefined}>
        <div className={classes.section}>
          <TeamSwitcher
            currentTeamId={space.teamId}
            pendingTeamId={pendingTeamId}
            teams={teamsQuery.data?.items ?? []}
            collapsed={collapsed}
            onTeamChange={handleTeamChange}
          />
          {!collapsed && pendingTeamId && pendingTeamId !== space.teamId && (
            <Text size="xs" c="dimmed" mt="xs" role="status">
              {t("Choose a space to continue")}
            </Text>
          )}
        </div>

        <Divider mb="xs" />

        <div className={classes.section}>
          <SpaceMenuItem
            collapsed={collapsed}
            label={t("Overview")}
            icon={IconHome}
            component={Link}
            to={getSpaceUrl(spaceSlug)}
            className={
              location.pathname.toLowerCase() === getSpaceUrl(spaceSlug)
                ? classes.activeButton
                : ""
            }
          />

          <SpaceMenuItem
            collapsed={collapsed}
            label={t("Search")}
            icon={IconSearch}
            onClick={searchSpotlight.open}
          />

          {spaceAbility.can(SpaceCaslAction.Create, SpaceCaslSubject.Page) && (
            <SpaceMenuItem
              collapsed={collapsed}
              label={t("New page")}
              icon={IconPlus}
              onClick={() => {
                handleCreatePage();
                if (mobileSidebarOpened) {
                  toggleMobileSidebar();
                }
              }}
            />
          )}
        </div>

        {collapsed && (
          <>
            <Divider mb="xs" />
            <div className={classes.section}>
              <SidebarFavoritesCollapsed spaceId={space.id} />

              <CollapsedSectionPopover
                label={space.name}
                icon={IconFiles}
                width={280}
              >
                <SpaceSwitcher
                  currentSpace={space}
                  teamId={space.teamId}
                  pendingTeamId={pendingTeamId}
                  collapsed={false}
                  opened={spaceSwitcherOpened}
                  onOpenedChange={setSpaceSwitcherOpened}
                  onSpaceChange={() => setSpaceSwitcherOpened(false)}
                  onCancelPendingChange={cancelPendingTeamChange}
                />
                <div className={classes.collapsedTree}>
                  <SpaceTree
                    spaceId={space.id}
                    readOnly={
                      spaceAbility.cannot(
                        SpaceCaslAction.Create,
                        SpaceCaslSubject.Page,
                      ) &&
                      spaceAbility.cannot(
                        SpaceCaslAction.Edit,
                        SpaceCaslSubject.Page,
                      )
                    }
                  />
                </div>
              </CollapsedSectionPopover>
            </div>
          </>
        )}

        {!collapsed && (
          <>
            <Divider mb="xs" />
            <SidebarFavorites spaceId={space.id} />
          </>
        )}

        {!collapsed && (
          <>
            <div className={clsx(classes.section, classes.sectionPages)}>
              <Group className={classes.pagesHeader} justify="space-between">
                <SpaceSwitcher
                  currentSpace={space}
                  teamId={space.teamId}
                  pendingTeamId={pendingTeamId}
                  fullWidth={false}
                  opened={spaceSwitcherOpened}
                  onOpenedChange={setSpaceSwitcherOpened}
                  onSpaceChange={() => setSpaceSwitcherOpened(false)}
                  onCancelPendingChange={cancelPendingTeamChange}
                />

                <Group gap="xs" className={classes.pageActions}>
                  <SpaceMenu
                    spaceId={space.id}
                    canManagePages={
                      spaceAbility.can(
                        SpaceCaslAction.Create,
                        SpaceCaslSubject.Page,
                      ) ||
                      spaceAbility.can(
                        SpaceCaslAction.Edit,
                        SpaceCaslSubject.Page,
                      ) ||
                      spaceAbility.can(
                        SpaceCaslAction.Delete,
                        SpaceCaslSubject.Page,
                      )
                    }
                    canManageSpaceSettings={canManageSpaceSettings}
                    onSpaceSettings={openSettings}
                  />

                  {spaceAbility.can(
                    SpaceCaslAction.Create,
                    SpaceCaslSubject.Page,
                  ) && (
                    <Tooltip
                      label={t("Create page")}
                      withArrow
                      position="right"
                    >
                      <ActionIcon
                        variant="light"
                        color="gray"
                        size="md"
                        className={classes.pageActionButton}
                        onClick={handleCreatePage}
                        aria-label={t("Create page")}
                      >
                        <IconPlus size={18} />
                      </ActionIcon>
                    </Tooltip>
                  )}
                </Group>
              </Group>

              <div className={classes.pages}>
                <SpaceTree
                  spaceId={space.id}
                  readOnly={
                    spaceAbility.cannot(
                      SpaceCaslAction.Create,
                      SpaceCaslSubject.Page,
                    ) &&
                    spaceAbility.cannot(
                      SpaceCaslAction.Edit,
                      SpaceCaslSubject.Page,
                    )
                  }
                />
              </div>
            </div>
          </>
        )}

        {!collapsed && <LocalPageGraph />}

        {canManageSpaceSettings && (
          <div className={classes.bottomSection}>
            <SpaceMenuItem
              collapsed={collapsed}
              label={t("Space settings")}
              icon={IconSettings}
              onClick={openSettings}
            />
          </div>
        )}
      </div>
    </>
  );
}

interface SpaceMenuItemProps {
  collapsed: boolean;
  label: string;
  icon: React.ElementType;
  onClick?: () => void;
  component?: any;
  to?: string;
  className?: string;
}

function SpaceMenuItem({
  collapsed,
  label,
  icon: Icon,
  onClick,
  component,
  to,
  className,
}: SpaceMenuItemProps) {
  const button = (
    <UnstyledButton
      component={component}
      to={to}
      onClick={onClick}
      className={clsx(classes.menu, className)}
      aria-label={collapsed ? label : undefined}
    >
      <div className={classes.menuItemInner}>
        <Icon size={18} className={classes.menuItemIcon} stroke={2} />
        {!collapsed && <span>{label}</span>}
      </div>
    </UnstyledButton>
  );

  return collapsed ? (
    <Tooltip label={label} position="right" withArrow>
      {button}
    </Tooltip>
  ) : (
    button
  );
}

interface SpaceMenuProps {
  spaceId: string;
  canManagePages: boolean;
  canManageSpaceSettings: boolean;
  onSpaceSettings: () => void;
}
function SpaceMenu({
  spaceId,
  canManagePages,
  canManageSpaceSettings,
  onSpaceSettings,
}: SpaceMenuProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const [importOpened, { open: openImportModal, close: closeImportModal }] =
    useDisclosure(false);
  const [exportOpened, { open: openExportModal, close: closeExportModal }] =
    useDisclosure(false);

  const { data: watchStatus } = useSpaceWatchStatusQuery(spaceId);
  const watchMutation = useWatchSpaceMutation();
  const unwatchMutation = useUnwatchSpaceMutation();
  const isWatching = watchStatus?.watching ?? false;

  const favoriteIds = useFavoriteIds("space");
  const addFavoriteMutation = useAddFavoriteMutation();
  const removeFavoriteMutation = useRemoveFavoriteMutation();
  const isFavorited = favoriteIds.has(spaceId);

  const handleToggleFavorite = () => {
    const params = { type: "space" as const, spaceId };
    if (isFavorited) {
      removeFavoriteMutation.mutate(params);
    } else {
      addFavoriteMutation.mutate(params);
    }
  };

  const handleToggleWatch = () => {
    if (isWatching) {
      unwatchMutation.mutate(spaceId);
    } else {
      watchMutation.mutate(spaceId);
    }
  };

  return (
    <>
      <Menu width={200} shadow="md" withArrow>
        <Menu.Target>
          <Tooltip label={t("Space menu")} withArrow position="top">
            <ActionIcon
              variant="light"
              color="gray"
              size="md"
              className={classes.pageActionButton}
              aria-label={t("Space menu")}
            >
              <IconDots size={18} />
            </ActionIcon>
          </Tooltip>
        </Menu.Target>

        <Menu.Dropdown>
          <Menu.Item
            onClick={handleToggleFavorite}
            leftSection={
              isFavorited ? (
                <IconStarFilled
                  size={16}
                  color="var(--mantine-color-yellow-filled)"
                />
              ) : (
                <IconStar size={16} />
              )
            }
          >
            {isFavorited ? t("Remove from favorites") : t("Add to favorites")}
          </Menu.Item>

          <Menu.Item
            onClick={handleToggleWatch}
            leftSection={
              isWatching ? <IconEyeOff size={16} /> : <IconEye size={16} />
            }
          >
            {isWatching ? t("Stop watching space") : t("Watch space")}
          </Menu.Item>

          {canManagePages && (
            <>
              <Menu.Divider />

              <Menu.Item
                onClick={openImportModal}
                leftSection={<IconArrowDown size={16} />}
              >
                {t("Import pages")}
              </Menu.Item>

              <Menu.Item
                onClick={openExportModal}
                leftSection={<IconFileExport size={16} />}
              >
                {t("Export space")}
              </Menu.Item>

              <Menu.Divider />

              {canManageSpaceSettings && (
                <Menu.Item
                  onClick={onSpaceSettings}
                  leftSection={<IconSettings size={16} />}
                >
                  {t("Space settings")}
                </Menu.Item>
              )}

              <Menu.Item
                component={Link}
                to={`/s/${spaceSlug}/trash`}
                leftSection={<IconTrash size={16} />}
              >
                {t("Trash")}
              </Menu.Item>
            </>
          )}
        </Menu.Dropdown>
      </Menu>

      {canManagePages && (
        <>
          <PageImportModal
            spaceId={spaceId}
            open={importOpened}
            onClose={closeImportModal}
          />

          <ExportModal
            type="space"
            id={spaceId}
            open={exportOpened}
            onClose={closeExportModal}
          />
        </>
      )}

    </>
  );
}
