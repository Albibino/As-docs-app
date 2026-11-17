import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import { ActionIcon, Popover, Text, Tooltip, UnstyledButton } from "@mantine/core";
import {
  IconArrowsDiagonal,
  IconChevronDown,
  IconFileText,
  IconLanguage,
  IconPlus,
  IconSearch,
  IconSparkles,
  IconX,
} from "@tabler/icons-react";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import { usePageQuery } from "@/features/page/queries/page-query";
import { extractPageSlugId } from "@/lib";
import { useAssistantChat } from "../hooks/use-assistant-chat";
import { useConversationQuery } from "../queries/assistant-query";
import { chatPath, NEW_CHAT_PATH } from "../utils/assistant-paths";
import MessageList from "./message-list";
import Composer from "./composer";
import HistoryList from "./history-list";
import ErrorNotice from "./error-notice";
import classes from "../styles/panel.module.css";

/**
 * Painel do assistente ao lado da página aberta. A página vira o contexto das
 * perguntas (`contextPageId`) até o usuário removê-la.
 */
export default function AsideAssistantPanel() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, setAside] = useAtom(asideStateAtom);
  const [chatId, setChatId] = useState<string | undefined>();
  const [historyOpen, setHistoryOpen] = useState(false);
  const [contextDismissed, setContextDismissed] = useState(false);

  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({ pageId: extractPageSlugId(pageSlug) });
  useEffect(() => setContextDismissed(false), [page?.id]);
  const contextPage =
    page && !contextDismissed
      ? { id: page.id, title: page.title || "" }
      : null;

  const info = useConversationQuery(chatId);
  const chat = useAssistantChat({ chatId, onChatCreated: setChatId });
  const { loadHistory } = chat;

  useEffect(() => {
    if (info.data) loadHistory(info.data.messages);
  }, [info.data, loadHistory]);

  // Sem acesso à conversa (404/403): volta a uma conversa nova.
  useEffect(() => {
    if (chatId && info.isError) setChatId(undefined);
  }, [chatId, info.isError]);

  const send = useCallback(
    (text: string) => chat.send(text, contextPage?.id),
    [chat.send, contextPage?.id],
  );

  const newChat = () => {
    setChatId(undefined);
    setContextDismissed(false);
  };

  const openFullPage = () => {
    navigate(chatId ? chatPath(chatId) : NEW_CHAT_PATH);
    setAside({ tab: "", isAsideOpen: false });
  };

  const actions = [
    { icon: <IconFileText size={16} />, label: t("Summarize this page") },
    { icon: <IconLanguage size={16} />, label: t("Translate this page") },
    { icon: <IconSearch size={16} />, label: t("Analyze for insights") },
  ];

  const hasMessages = chat.messages.length > 0 || chat.isStreaming;

  return (
    <div className={classes.panel}>
      <div className={classes.toolbar}>
        <Popover
          opened={historyOpen}
          onChange={setHistoryOpen}
          position="bottom-start"
          width={280}
          shadow="md"
        >
          <Popover.Target>
            <UnstyledButton
              className={classes.title}
              onClick={() => setHistoryOpen((open) => !open)}
            >
              <span className={classes.titleText}>
                {info.data?.chat?.title || t("New chat")}
              </span>
              <IconChevronDown size={16} />
            </UnstyledButton>
          </Popover.Target>
          <Popover.Dropdown>
            <HistoryList
              activeId={chatId}
              onSelect={(id) => {
                setChatId(id);
                setHistoryOpen(false);
              }}
            />
          </Popover.Dropdown>
        </Popover>

        <div style={{ flex: 1 }} />

        <Tooltip label={t("New chat")} openDelay={250}>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("New chat")}
            onClick={newChat}
          >
            <IconPlus size={20} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Open full page")} openDelay={250}>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Open full page")}
            onClick={openFullPage}
          >
            <IconArrowsDiagonal size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t("Close")} openDelay={250}>
          <ActionIcon
            variant="subtle"
            color="dark"
            aria-label={t("Close")}
            onClick={() => setAside({ tab: "", isAsideOpen: false })}
          >
            <IconX size={20} />
          </ActionIcon>
        </Tooltip>
      </div>

      <ErrorNotice error={chat.error} />

      {hasMessages ? (
        <div className={classes.messages}>
          <MessageList messages={chat.messages} draft={chat.draft} />
        </div>
      ) : (
        <div className={classes.empty}>
          <IconSparkles size={36} stroke={1.5} />
          <Text fw={500}>{t("How can I help you today?")}</Text>
          <div className={classes.quickActions}>
            {actions.map((action) => (
              <UnstyledButton
                key={action.label}
                className={classes.quickAction}
                onClick={() => send(action.label)}
              >
                {action.icon}
                <span>{action.label}</span>
              </UnstyledButton>
            ))}
          </div>
        </div>
      )}

      <div className={classes.composer}>
        <Composer
          isStreaming={chat.isStreaming}
          onSend={send}
          onStop={chat.stop}
          placeholder={t("Ask anything...")}
          autoFocus={false}
          disabled={Boolean(chatId) && info.isLoading}
          contextPage={contextPage}
          onRemoveContext={() => setContextDismissed(true)}
        />
      </div>
    </div>
  );
}
