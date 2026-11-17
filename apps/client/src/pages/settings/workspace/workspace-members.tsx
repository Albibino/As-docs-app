import { Space } from "@mantine/core";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import WorkspaceMembersTable from "@/features/workspace/components/members/components/workspace-members-table";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { getAppName } from "@/lib/config.ts";

/** TCC: membros fixos (Usuário 1 e 2); sem convites. */
export default function WorkspaceMembers() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Members")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Members")} />
      <Space h="lg" />
      <WorkspaceMembersTable />
    </>
  );
}
