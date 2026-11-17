import { useEffect, useState } from "react";
import { ScrollArea, Text, Divider, Tooltip } from "@mantine/core";
import {
  IconHome,
  IconStar,
  IconSettings,
} from "@tabler/icons-react";
import { Link, useLocation } from "react-router-dom";
import classes from "./global-sidebar.module.css";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar";
import { useTeamsQuery } from "@/features/team/queries/team-query";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import SidebarConversations from "@/features/assistant/components/sidebar-conversations";

const SIDEBAR_TEAM_LIMIT = 10;

export default function GlobalSidebar({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const { t } = useTranslation();
  const location = useLocation();
  const [active, setActive] = useState(location.pathname);
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);
  const mainNavItems = [
    { label: "Home", icon: IconHome, path: "/home" },
    { label: "Favorites", icon: IconStar, path: "/favorites" },
  ];
  const { data: teamsData, isPending: isTeamsPending } = useTeamsQuery({
    limit: SIDEBAR_TEAM_LIMIT + 1,
  });
  const sortedTeams = [...(teamsData?.items ?? [])].sort((a, b) => {
    const cmp = (a.name ?? "").localeCompare(b.name ?? "", undefined, {
      sensitivity: "base",
    });
    return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
  });
  const hasMoreTeams = sortedTeams.length > SIDEBAR_TEAM_LIMIT;

  useEffect(() => {
    setActive(location.pathname);
  }, [location.pathname]);

  // A home inclui as conversas com a IA ("/home/chat/:chatId").
  const isActivePath = (path: string) =>
    active === path || (path === "/home" && active.startsWith("/home/"));

  const handleNavClick = () => {
    if (mobileSidebarOpened) {
      toggleMobileSidebar();
    }
  };

  return (
    <div className={classes.navbar} data-collapsed={collapsed || undefined}>
      <ScrollArea w="100%" style={{ flex: 1 }} offsetScrollbars="present">
        <div className={classes.section}>
          {mainNavItems.map((item) => {
            const link = (
              <Link
                key={item.label}
                className={classes.link}
                data-active={isActivePath(item.path) || undefined}
                aria-current={isActivePath(item.path) ? "page" : undefined}
                aria-label={collapsed ? t(item.label) : undefined}
                to={item.path}
                onClick={handleNavClick}
              >
                <item.icon className={classes.linkIcon} stroke={2} />
                {!collapsed && <span>{t(item.label)}</span>}
              </Link>
            );
            return collapsed ? (
              <Tooltip key={item.label} label={t(item.label)} position="right" withArrow>
                {link}
              </Tooltip>
            ) : (
              link
            );
          })}
        </div>

        <Divider my="xs" />
        <div className={classes.section}>
          {!collapsed && (
            <Text component="h2" className={classes.sectionHeader}>
              {t("Teams")}
            </Text>
          )}
          {!isTeamsPending && sortedTeams.length === 0 ? (
            !collapsed && (
              <Text size="xs" c="dimmed" pl="xs" py={4}>
                {t("Teams you belong to or that are shared with you appear here")}
              </Text>
            )
          ) : (
            <>
              {sortedTeams.slice(0, SIDEBAR_TEAM_LIMIT).map((team) => {
                const teamLink = (
                  <Link
                    key={team.id}
                    className={classes.spaceItem}
                    to={`/spaces?teamId=${encodeURIComponent(team.id)}`}
                    aria-label={collapsed ? team.name : undefined}
                    onClick={handleNavClick}
                  >
                    <CustomAvatar
                      name={team.name}
                      color="initials"
                      variant="filled"
                      size={20}
                    />
                    {!collapsed && (
                      <Text size="sm" fw={500} lineClamp={1}>
                        {team.name}
                      </Text>
                    )}
                  </Link>
                );
                return collapsed ? (
                  <Tooltip key={team.id} label={team.name} position="right" withArrow>
                    {teamLink}
                  </Tooltip>
                ) : (
                  teamLink
                );
              })}
              {hasMoreTeams && !collapsed && (
                <Link
                  className={classes.spaceItem}
                  to="/settings/teams"
                  onClick={handleNavClick}
                >
                  <Text size="xs" c="dimmed">
                    {t("View all teams")}
                  </Text>
                </Link>
              )}
            </>
          )}
        </div>

        {!collapsed && (
          <>
            <Divider my="xs" />
            <div className={classes.section}>
              <SidebarConversations onNavigate={handleNavClick} />
            </div>
          </>
        )}
      </ScrollArea>

      <div className={classes.bottomSection}>
        {(() => {
          const settingsLink = (
            <Link
              className={classes.link}
              data-active={active.startsWith("/settings") || undefined}
              aria-current={active.startsWith("/settings") ? "page" : undefined}
              aria-label={collapsed ? t("Settings") : undefined}
              to="/settings/account/profile"
              onClick={handleNavClick}
            >
              <IconSettings className={classes.linkIcon} stroke={2} />
              {!collapsed && <span>{t("Settings")}</span>}
            </Link>
          );
          return collapsed ? (
            <Tooltip label={t("Settings")} position="right" withArrow>
              {settingsLink}
            </Tooltip>
          ) : (
            settingsLink
          );
        })()}
      </div>
    </div>
  );
}
