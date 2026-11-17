import { Helmet } from "react-helmet-async";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { WorkspacePagePropertiesSettings } from "@/features/page-property";
import useUserRole from "@/hooks/use-user-role.tsx";
import { getAppName } from "@/lib/config.ts";

export default function WorkspaceMetadata() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  return (
    <>
      <Helmet>
        <title>
          {t("Metadata")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Metadata")} />

      {isAdmin ? (
        <WorkspacePagePropertiesSettings canManage />
      ) : (
        <Text size="sm" c="dimmed">
          {t("Only workspace admins can manage workspace metadata.")}
        </Text>
      )}
    </>
  );
}
