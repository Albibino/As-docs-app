import React, { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Group, Text, ScrollArea, ActionIcon } from "@mantine/core";
import {
  IconUser,
  IconSettings,
  IconUsers,
  IconArrowLeft,
  IconTag,
  IconUsersGroup,
  IconBrush,
  IconDatabase,
  IconFileImport,
} from "@tabler/icons-react";
import { Link, useLocation, useParams } from "react-router-dom";
import classes from "./settings.module.css";
import { useTranslation } from "react-i18next";
import { getSpaceSettingsUrl, getSpaceUrl } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { useAtom } from "jotai";
import {
  prefetchWorkspaceMembers,
  prefetchTeams,
} from "@/components/settings/settings-queries.tsx";
import AppVersion from "@/components/settings/app-version.tsx";
import { mobileSidebarAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";
import { useToggleSidebar } from "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts";
import { useSettingsNavigation } from "@/hooks/use-settings-navigation";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useTeamsQuery } from "@/features/team/queries/team-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";

type DataItem = {
  label: string;
  icon: React.ElementType;
  path: string;
  role?: "admin" | "owner";
};

type DataGroup = {
  heading: string;
  items: DataItem[];
};

type SettingsSidebarProps = {
  scope?: "workspace" | "space";
};

const groupedData: DataGroup[] = [
  {
    heading: "Account",
    items: [
      { label: "Profile", icon: IconUser, path: "/settings/account/profile" },
      {
        label: "Preferences",
        icon: IconBrush,
        path: "/settings/account/preferences",
      },
    ],
  },
  {
    heading: "Workspace",
    items: [
      { label: "General", icon: IconSettings, path: "/settings/workspace" },
      { label: "Members", icon: IconUsers, path: "/settings/members" },
      { label: "Teams", icon: IconUsersGroup, path: "/settings/teams" },
      { label: "Metadata", icon: IconDatabase, path: "/settings/metadata" },
      { label: "Labels", icon: IconTag, path: "/settings/labels" },
    ],
  },
];

export default function SettingsSidebar({
  scope = "workspace",
}: SettingsSidebarProps) {
  const { t } = useTranslation();
  const location = useLocation();
  const { spaceSlug } = useParams<{ spaceSlug?: string }>();
  const { data: space } = useGetSpaceBySlugQuery(
    scope === "space" ? (spaceSlug ?? "") : "",
  );
  const spaceAbility = useSpaceAbility(space?.permission);
  const [active, setActive] = useState(location.pathname);
  const { goBack } = useSettingsNavigation();
  const { isAdmin, isOwner } = useUserRole();
  const { data: teams } = useTeamsQuery({ limit: 100 }, scope === "workspace" && !isAdmin);
  const [mobileSidebarOpened] = useAtom(mobileSidebarAtom);
  const toggleMobileSidebar = useToggleSidebar(mobileSidebarAtom);

  useEffect(() => {
    setActive(location.pathname);
  }, [location.pathname]);

  const canShowItem = (item: DataItem) => {
    if (item.role === "admin" && !isAdmin) return false;
    if (item.role === "owner" && !isOwner) return false;
    return true;
  };

  const spaceData: DataGroup[] =
    scope === "space" && spaceSlug
      ? [
          {
            heading: "Space",
            items: [
              {
                label: "General",
                icon: IconSettings,
                path: getSpaceSettingsUrl(spaceSlug, "general"),
              },
              {
                label: "Members",
                icon: IconUsers,
                path: getSpaceSettingsUrl(spaceSlug, "members"),
              },
              ...(spaceAbility.can(
                SpaceCaslAction.Manage,
                SpaceCaslSubject.Label,
              )
                ? [
                    {
                      label: "Labels",
                      icon: IconTag,
                      path: getSpaceSettingsUrl(spaceSlug, "labels"),
                    },
                  ]
                : []),
              ...(spaceAbility.can(
                SpaceCaslAction.Read,
                SpaceCaslSubject.Settings,
              )
                ? [
                    {
                      label: "Properties",
                      icon: IconBrush,
                      path: getSpaceSettingsUrl(spaceSlug, "properties"),
                    },
                  ]
                : []),
            ],
          },
        ]
      : [];

  const sidebarData = [...(scope === "space" ? spaceData : groupedData)]
    .filter(
      (group) => scope === "space" || group.heading !== "Workspace" || isAdmin,
    );
  if (scope === "workspace" && !isAdmin && teams?.items.some((team) => team.isAdmin)) {
    sidebarData.push({
      heading: "Teams",
      items: [{ label: "Teams", icon: IconUsersGroup, path: "/settings/teams" }],
    });
  }

  const menuItems = sidebarData.map((group) => {
    return (
      <div key={group.heading}>
        <Text c="dimmed" className={classes.linkHeader}>
          {t(group.heading)}
        </Text>
        {group.items.map((item) => {
          if (!canShowItem(item)) {
            return null;
          }

          let prefetchHandler: any;
          if (scope === "space") {
            prefetchHandler = undefined;
          } else {
            switch (item.label) {
              case "Members":
                prefetchHandler = prefetchWorkspaceMembers;
                break;
              case "Teams":
                prefetchHandler = prefetchTeams;
                break;
              default:
                break;
            }
          }

          return (
            <Link
              onMouseEnter={prefetchHandler}
              className={classes.link}
              data-active={active.startsWith(item.path) || undefined}
              key={item.label}
              to={item.path}
              state={location.state}
              onClick={() => {
                if (mobileSidebarOpened) {
                  toggleMobileSidebar();
                }
              }}
            >
              <item.icon className={classes.linkIcon} stroke={2} />
              <span>{t(item.label)}</span>
            </Link>
          );
        })}
      </div>
    );
  });

  return (
    <div className={classes.navbar}>
      <Group className={classes.title} justify="flex-start">
        <ActionIcon
          onClick={() => {
            goBack(
              scope === "space" && spaceSlug
                ? getSpaceUrl(spaceSlug)
                : undefined,
              (location.state as { settingsOrigin?: string } | null)
                ?.settingsOrigin,
            );
            if (mobileSidebarOpened) {
              toggleMobileSidebar();
            }
          }}
          variant="transparent"
          c="gray"
          aria-label={t("Back")}
        >
          <IconArrowLeft stroke={2} />
        </ActionIcon>
        <Text fw={500}>{t("Settings")}</Text>
      </Group>

      <ScrollArea w="100%">{menuItems}</ScrollArea>

      <AppVersion />
    </div>
  );
}
