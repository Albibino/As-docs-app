import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader, Group, Paper, Text } from "@mantine/core";
import CopyTextButton from "@/components/common/copy.tsx";
import type { AnswerMeta, ChatMessage } from "../types/assistant.types";
import { internalPageHref, renderAnswerHtml } from "../utils/render-markdown";
import AnswerDetails from "./answer-details";
import classes from "../styles/assistant.module.css";

type Props = {
  message: Pick<ChatMessage, "role" | "content" | "meta">;
  /** Resposta ainda sendo gerada. */
  streaming?: boolean;
};

export default function MessageBubble({ message, streaming = false }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const html = useMemo(
    () => (message.content ? renderAnswerHtml(message.content) : ""),
    [message.content],
  );

  // Links internos (páginas citadas) navegam sem recarregar o app.
  const onContentClick = useCallback(
    (event: React.MouseEvent<HTMLDivElement>) => {
      const anchor = (event.target as HTMLElement).closest("a");
      const target = internalPageHref(anchor?.getAttribute("href") ?? null);
      if (target) {
        event.preventDefault();
        navigate(target);
      }
    },
    [navigate],
  );

  if (message.role === "user") {
    return (
      <div
        className={classes.userRow}
        role="article"
        aria-label={t("You said:")}
      >
        <Paper className={classes.userBubble} radius="lg" px="md" py="xs">
          {message.content}
        </Paper>
      </div>
    );
  }

  const meta = message.meta as AnswerMeta | null;
  const hasText = Boolean(message.content);
  const announce = hasText || meta?.found === false;

  return (
    <div
      className={classes.assistantRow}
      role="article"
      aria-label={announce ? t("Assistant said:") : undefined}
    >
      {hasText && (
        <div
          className={classes.markdown}
          onClick={onContentClick}
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
      <AnswerDetails meta={meta} />
      {streaming && !hasText && (
        <Group gap={6} c="dimmed">
          <Loader size="xs" type="dots" />
          <Text size="sm">{t("Thinking")}</Text>
        </Group>
      )}
      {!streaming && hasText && (
        <div className={classes.messageActions}>
          <CopyTextButton
            text={message.content ?? ""}
            label={t("Copy assistant response")}
          />
        </div>
      )}
    </div>
  );
}
