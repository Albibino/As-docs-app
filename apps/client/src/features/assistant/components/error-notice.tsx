import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import type { AssistantError } from "../types/assistant.types";

/** Mensagem de falha. O texto do backend nunca é exibido: só os daqui. */
export default function ErrorNotice({
  error,
}: {
  error: AssistantError | null;
}) {
  const { t } = useTranslation();
  if (!error) return null;
  const text =
    error.kind === "unavailable"
      ? t("The AI service is unavailable right now. Try again in a moment.")
      : error.kind === "interrupted"
        ? t("The answer was interrupted. Try asking again.")
        : t("Could not get an answer. Try again.");
  return (
    <Text role="alert" size="sm" c="red" px="lg" py="xs">
      {text}
    </Text>
  );
}
