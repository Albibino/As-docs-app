import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ActionIcon, Menu, TextInput } from "@mantine/core";
import { IconDots, IconEdit, IconTrash } from "@tabler/icons-react";
import type { Conversation } from "../types/assistant.types";
import { chatPath } from "../utils/assistant-paths";
import classes from "../styles/conversations.module.css";

type Props = {
  conversation: Conversation;
  active: boolean;
  onRename: (chatId: string, title: string) => void;
  onDelete: (chatId: string, title: string | null) => void;
  onNavigate?: () => void;
};

/** Hora se for de hoje; senão dia e mês (com ano se for de outro ano). */
export function formatConversationDate(iso: string, locale?: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  if (date.getTime() >= startOfToday) {
    return date.toLocaleTimeString(locale, { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString(locale, {
    month: "short",
    day: "numeric",
    ...(date.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }),
  });
}

export default function ConversationItem({
  conversation,
  active,
  onRename,
  onDelete,
  onNavigate,
}: Props) {
  const { t, i18n } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const title = conversation.title || t("Untitled chat");

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const commit = () => {
    const next = name.trim();
    if (next && next !== conversation.title) onRename(conversation.id, next);
    setEditing(false);
  };

  if (editing) {
    return (
      <div className={classes.item} data-active={active || undefined}>
        <TextInput
          ref={inputRef}
          size="xs"
          variant="unstyled"
          style={{ flex: 1 }}
          aria-label={t("Chat name")}
          placeholder={t("Chat name")}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape") {
              event.preventDefault();
              setEditing(false);
            }
          }}
        />
      </div>
    );
  }

  return (
    <div className={classes.item} data-active={active || undefined}>
      <Link
        to={chatPath(conversation.id)}
        className={classes.itemLink}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
      >
        <span className={classes.itemTitle}>{title}</span>
        <span className={classes.itemDate}>
          {formatConversationDate(conversation.updatedAt, i18n.language)}
        </span>
      </Link>
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <ActionIcon
            className={classes.itemMenu}
            variant="subtle"
            color="gray"
            size="xs"
            aria-label={t("Chat menu for {{title}}", { title })}
          >
            <IconDots size={14} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<IconEdit size={14} />}
            onClick={() => {
              setName(conversation.title ?? "");
              setEditing(true);
            }}
          >
            {t("Rename")}
          </Menu.Item>
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={14} />}
            onClick={() => onDelete(conversation.id, conversation.title)}
          >
            {t("Delete")}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </div>
  );
}
