import { Helmet } from "react-helmet-async";
import { Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";
import useUserRole from "@/hooks/use-user-role.tsx";
import { LabelTaxonomyManager } from "@/features/label/components/admin/label-taxonomy-manager.tsx";

export default function LabelsSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();

  return (
    <>
      <Helmet>
        <title>
          {t("Labels")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Labels")} />

      <Text size="sm" c="dimmed" mb="md">
        {t(
          "Labels created here are available in every space. Space admins can add labels of their own from a space's settings.",
        )}
      </Text>

      {isAdmin ? (
        <LabelTaxonomyManager />
      ) : (
        <Text size="sm" c="dimmed">
          {t("Only workspace admins can manage workspace labels.")}
        </Text>
      )}
    </>
  );
}
