import { Navigate, useParams } from "react-router-dom";
import { Loader, Text } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { getAppName, getSpaceUrl } from "@/lib/config.ts";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { useGetSpaceBySlugQuery } from "@/features/space/queries/space-query.ts";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability.ts";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import SpaceDetails from "@/features/space/components/space-details.tsx";
import { SpacePermissions } from "@/features/space/components/space-permissions.tsx";
import { LabelTaxonomyManager } from "@/features/label/components/admin/label-taxonomy-manager.tsx";
import { SpacePagePropertiesSettings } from "@/features/page-property";

const TAB_TITLE_KEYS = {
  general: "General",
  members: "Members",
  labels: "Labels",
  properties: "Properties",
} as const;

type SpaceSettingsTab = keyof typeof TAB_TITLE_KEYS;

function isSpaceSettingsTab(
  value: string | undefined,
): value is SpaceSettingsTab {
  return value !== undefined && value in TAB_TITLE_KEYS;
}

export default function SpaceSettings() {
  const { t } = useTranslation();
  const { spaceSlug, tab } = useParams<{
    spaceSlug: string;
    tab: string;
  }>();
  const { data: space } = useGetSpaceBySlugQuery(spaceSlug ?? "");
  const spaceAbility = useSpaceAbility(space?.permission);

  if (!space) {
    return <Loader />;
  }

  const canManageSettings = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Settings,
  );

  if (!canManageSettings) {
    return <Navigate to={getSpaceUrl(space.slug)} replace />;
  }

  if (!isSpaceSettingsTab(tab)) {
    return <Navigate to="../general" replace />;
  }

  if (space.archivedAt && tab !== "general") {
    return <Navigate to="../general" replace />;
  }

  const canReadSettings = spaceAbility.can(
    SpaceCaslAction.Read,
    SpaceCaslSubject.Settings,
  );
  const canManageMembers = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Member,
  );
  const canManageLabels = spaceAbility.can(
    SpaceCaslAction.Manage,
    SpaceCaslSubject.Label,
  );

  if (
    (tab === "labels" && !canManageLabels) ||
    (tab === "properties" && !canReadSettings)
  ) {
    return <Navigate to="../general" replace />;
  }

  const title = t(TAB_TITLE_KEYS[tab]);

  return (
    <>
      <Helmet>
        <title>
          {title} - {space.name} - {getAppName()}
        </title>
      </Helmet>

      <SettingsTitle title={title} />

      {tab === "general" && (
        <SpaceDetails spaceId={space.id} readOnly={!canManageSettings} />
      )}

      {tab === "members" && (
        <SpacePermissions spaceId={space.id} canManage={canManageMembers} />
      )}

      {tab === "labels" && (
        <>
          <Text size="sm" c="dimmed" mb="md">
            {t(
              "Labels created here are only available in this space. Workspace labels are listed below and managed by workspace admins.",
            )}
          </Text>
          <LabelTaxonomyManager spaceId={space.id} />
        </>
      )}

      {tab === "properties" && (
        <SpacePagePropertiesSettings
          spaceId={space.id}
          canManage={canManageSettings}
        />
      )}
    </>
  );
}
