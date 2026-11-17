import { useMemo, useState } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAtom } from "jotai";
import {
  ActionIcon,
  Center,
  Collapse,
  Loader,
  Text,
  TextInput,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { modals } from "@mantine/modals";
import { IconChevronRight, IconPlus, IconSearch } from "@tabler/icons-react";
import { sidebarChatsOpenAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";
import {
  useConversationSearch,
  useConversationsQuery,
  useDeleteConversation,
  useRenameConversation,
} from "../queries/assistant-query";
import { CHAT_ROUTE_PATTERN, NEW_CHAT_PATH } from "../utils/assistant-paths";
import { groupConversations } from "../utils/group-conversations";
import ConversationItem from "./conversation-item";
import classes from "../styles/conversations.module.css";

const LIST_ID = "assistant-conversation-list";

/**
 * Seção "Conversas" da barra lateral global: histórico agrupado por data, com
 * busca, renomear e excluir. O cabeçalho recolhe a lista (a escolha fica salva)
 * e o "+" abre uma conversa nova na home.
 */
export default function SidebarConversations({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const activeId = matchPath(CHAT_ROUTE_PATTERN, pathname)?.params.chatId;
  const [opened, setOpened] = useAtom(sidebarChatsOpenAtom);
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search.trim(), 300);
  const searching = debounced.length > 0;

  const list = useConversationsQuery();
  const found = useConversationSearch(debounced);
  const rename = useRenameConversation();
  const remove = useDeleteConversation();

  const items = searching ? (found.data ?? []) : (list.data ?? []);
  const loading = searching ? found.isLoading : list.isLoading;
  const groups = useMemo(() => groupConversations(items, t), [items, t]);

  const confirmDelete = (id: string, title: string | null) => {
    modals.openConfirmModal({
      title: t("Delete chat"),
      centered: true,
      children: (
        <Text size="sm">
          {t(
            "Are you sure you want to delete '{{title}}'? This action cannot be undone.",
            { title: title || t("Untitled") },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () =>
        remove.mutate(id, {
          onSuccess: () => {
            if (activeId === id) navigate(NEW_CHAT_PATH);
          },
        }),
    });
  };

  const renderItem = (conversation: (typeof items)[number]) => (
    <ConversationItem
      key={conversation.id}
      conversation={conversation}
      active={conversation.id === activeId}
      onNavigate={onNavigate}
      onDelete={confirmDelete}
      onRename={(chatId, title) => rename.mutate({ chatId, title })}
    />
  );

  return (
    <div>
      <div className={classes.sectionHeader}>
        <UnstyledButton
          className={classes.sectionToggle}
          onClick={() => setOpened(!opened)}
          aria-expanded={opened}
          aria-controls={LIST_ID}
        >
          <IconChevronRight
            size={14}
            className={classes.chevron}
            data-opened={opened || undefined}
          />
          <span>{t("Conversations")}</span>
        </UnstyledButton>
        <Tooltip label={t("New chat")} openDelay={250} withArrow>
          <ActionIcon
            component={Link}
            to={NEW_CHAT_PATH}
            variant="subtle"
            color="gray"
            size="sm"
            aria-label={t("New chat")}
            onClick={onNavigate}
          >
            <IconPlus size={16} />
          </ActionIcon>
        </Tooltip>
      </div>

      <Collapse expanded={opened} id={LIST_ID}>
        <TextInput
          mt={4}
          size="xs"
          leftSection={<IconSearch size={14} />}
          placeholder={t("Search chats...")}
          aria-label={t("Search chats")}
          value={search}
          onChange={(event) => setSearch(event.currentTarget.value)}
        />
        {loading && (
          <Center py="xs">
            <Loader size="xs" />
          </Center>
        )}
        {!loading && items.length === 0 && (
          <Text size="xs" c="dimmed" px="xs" py={4}>
            {searching ? t("No chats found") : t("No conversations yet")}
          </Text>
        )}
        {searching
          ? items.map(renderItem)
          : groups.map((group) => (
              <section key={group.key} className={classes.group}>
                <h3 className={classes.groupLabel}>{group.label}</h3>
                {group.items.map(renderItem)}
              </section>
            ))}
      </Collapse>
    </div>
  );
}
