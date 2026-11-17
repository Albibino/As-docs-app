import type { Conversation } from "../types/assistant.types";

export type ConversationGroup = {
  key: "today" | "yesterday" | "week" | "month" | "older";
  label: string;
  items: Conversation[];
};

const DAY = 24 * 60 * 60 * 1000;

/** Agrupa por data da última atividade, do mais recente para o mais antigo. */
export function groupConversations(
  items: Conversation[],
  t: (key: string) => string,
  now: Date = new Date(),
): ConversationGroup[] {
  const today = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const groups: ConversationGroup[] = [
    { key: "today", label: t("Today"), items: [] },
    { key: "yesterday", label: t("Yesterday"), items: [] },
    { key: "week", label: t("Previous 7 days"), items: [] },
    { key: "month", label: t("Previous 30 days"), items: [] },
    { key: "older", label: t("Older"), items: [] },
  ];
  const limits = [today, today - DAY, today - 7 * DAY, today - 30 * DAY];

  for (const item of items) {
    const time = new Date(item.updatedAt).getTime();
    const index = limits.findIndex((limit) => time >= limit);
    groups[index === -1 ? 4 : index].items.push(item);
  }
  return groups.filter((group) => group.items.length > 0);
}
