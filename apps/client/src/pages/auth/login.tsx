import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { UserSelect } from "@/features/auth/components/user-select";
import { getAppName } from "@/lib/config.ts";

export default function LoginPage() {
  const { t } = useTranslation();

  return (
    <>
      <Helmet>
        <title>
          {t("Choose a user")} - {getAppName()}
        </title>
      </Helmet>
      <UserSelect />
    </>
  );
}
