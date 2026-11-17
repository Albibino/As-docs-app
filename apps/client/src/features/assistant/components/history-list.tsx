import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader, ScrollArea, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconSearch } from "@tabler/icons-react";
import {
  useConversationSearch,
  useConversationsQuery,
} from "../queries/assistant-query";
import classes from "../styles/conversations.module.css";

type Props = {
  activeId: string | undefined;
  onSelect: (chatId: string) => void;
};

/** Histórico compacto (busca + lista) usado no painel lateral da página. */
export default function HistoryList({ activeId, onSelect }: Props) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search.trim(), 300);
  const searching = debounced.length > 0;
  const list = useConversationsQuery();
  const found = useConversationSearch(debounced);
  const items = (searching ? found.data : list.data) ?? [];
  const loading = searching ? found.isLoading : list.isLoading;

  return (
    <div>
      <TextInput
        size="xs"
        mb="xs"
        leftSection={<IconSearch size={14} />}
        placeholder={t("Search chats...")}
        aria-label={t("Search chats")}
        value={search}
        onChange={(event) => setSearch(event.currentTarget.value)}
      />
      {loading ? (
        <div className={classes.historyLoading}>
          <Loader size="sm" />
        </div>
      ) : items.length === 0 ? (
        <Text size="sm" c="dimmed" ta="center" py="md">
          {searching ? t("No chats found") : t("No chat history")}
        </Text>
      ) : (
        <ScrollArea.Autosize mah={300} scrollbars="y">
          {items.map((conversation) => (
            <UnstyledButton
              key={conversation.id}
              className={classes.historyEntry}
              data-active={conversation.id === activeId || undefined}
              onClick={() => onSelect(conversation.id)}
            >
              {conversation.title || t("Untitled chat")}
            </UnstyledButton>
          ))}
        </ScrollArea.Autosize>
      )}
    </div>
  );
}
