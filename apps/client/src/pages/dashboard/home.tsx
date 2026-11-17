import { getAppName } from "@/lib/config.ts";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import DocsEntryRedirect from "@/features/home/components/docs-entry-redirect";
import AssistantPage from "@/features/assistant/pages/assistant-page.tsx";

// TCC: a home é o chat com a IA (conversa nova em "/home" e conversas
// existentes em "/home/chat/:chatId"). A lista de conversas fica na barra
// lateral, abaixo de Times.
export default function Home() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();

  if (searchParams.get("entry") === "1") {
    return <DocsEntryRedirect />;
  }

  return (
    <>
      <Helmet>
        <title>
          {t("Home")} - {getAppName()}
        </title>
      </Helmet>
      <AssistantPage />
    </>
  );
}
