import { useCallback, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ErrorBoundary } from "react-error-boundary";
import { useTranslation } from "react-i18next";
import { Button } from "@mantine/core";
import { IconAlertTriangle } from "@tabler/icons-react";
import { EmptyState } from "@/components/ui/empty-state.tsx";
import { useAssistantChat } from "../hooks/use-assistant-chat";
import { useConversationQuery } from "../queries/assistant-query";
import { chatPath, NEW_CHAT_PATH } from "../utils/assistant-paths";
import MessageList from "../components/message-list";
import Composer from "../components/composer";
import Welcome from "../components/welcome";
import ErrorNotice from "../components/error-notice";
import classes from "../styles/assistant.module.css";

function AssistantView() {
  const { chatId } = useParams<{ chatId: string }>();
  const navigate = useNavigate();
  const info = useConversationQuery(chatId);
  const chat = useAssistantChat({
    chatId,
    onChatCreated: (id) => navigate(chatPath(id), { replace: true }),
  });
  const { loadHistory } = chat;

  useEffect(() => {
    if (info.data) loadHistory(info.data.messages);
  }, [info.data, loadHistory]);

  // Conversa que não existe ou não é do usuário: volta para uma nova.
  useEffect(() => {
    if (chatId && info.isError) navigate(NEW_CHAT_PATH, { replace: true });
  }, [chatId, info.isError, navigate]);

  const send = useCallback((text: string) => chat.send(text), [chat.send]);

  if (chatId && info.isError) return null;

  const showTranscript =
    chat.messages.length > 0 || chat.isStreaming || Boolean(chatId);

  return (
    <div className={classes.page}>
      {showTranscript ? (
        <>
          <MessageList messages={chat.messages} draft={chat.draft} />
          <ErrorNotice error={chat.error} />
          <div className={classes.pageComposer}>
            <Composer
              isStreaming={chat.isStreaming}
              disabled={Boolean(chatId) && info.isLoading}
              onSend={send}
              onStop={chat.stop}
            />
          </div>
        </>
      ) : (
        <>
          <Welcome
            isStreaming={chat.isStreaming}
            onSend={send}
            onStop={chat.stop}
          />
          <ErrorNotice error={chat.error} />
        </>
      )}
    </div>
  );
}

/** Página do assistente: "/home" (nova) e "/home/chat/:chatId". */
export default function AssistantPage() {
  const { t } = useTranslation();
  const { chatId } = useParams<{ chatId: string }>();
  return (
    <ErrorBoundary
      resetKeys={[chatId]}
      fallbackRender={({ resetErrorBoundary }) => (
        <EmptyState
          icon={IconAlertTriangle}
          title={t("Failed to load chat. An error occurred.")}
          action={
            <Button
              variant="default"
              size="sm"
              mt="xs"
              onClick={resetErrorBoundary}
            >
              {t("Try again")}
            </Button>
          }
        />
      )}
    >
      <AssistantView />
    </ErrorBoundary>
  );
}
