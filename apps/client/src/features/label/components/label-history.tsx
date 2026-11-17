import { Divider, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useTimeAgo } from "@/hooks/use-time-ago.tsx";
import { usePageLabelHistoryQuery } from "@/features/label/queries/label-query.ts";
import {
  ILabelHistoryEntry,
  ILabelSnapshot,
} from "@/features/label/types/label.types.ts";

type LabelHistoryProps = {
  pageId: string;
  withDivider?: boolean;
};

export function LabelHistory({
  pageId,
  withDivider = false,
}: LabelHistoryProps) {
  const { t } = useTranslation();
  const { data } = usePageLabelHistoryQuery(pageId);

  const entries = data?.items ?? [];
  if (entries.length === 0) return null;

  return (
    <>
      {withDivider && <Divider />}
      <Stack gap="xs">
        <Text size="xs" fw={500} c="dimmed">
          {t("Label activity")}
        </Text>
        <Stack gap={8}>
          {entries.map((entry) => (
            <HistoryRow key={entry.id} entry={entry} />
          ))}
        </Stack>
      </Stack>
    </>
  );
}

/** "Module / ERP / Apps" for a taxonomy snapshot, otherwise the bare name. */
function describe(label: ILabelSnapshot): string {
  return label.treeName ? `${label.treeName}: ${label.name}` : label.name;
}

function HistoryRow({ entry }: { entry: ILabelHistoryEntry }) {
  const { t } = useTranslation();
  const timeAgo = useTimeAgo(entry.createdAt);

  const actorName = entry.actor?.name ?? t("Someone");
  const added = entry.changes?.after?.label;
  const removed = entry.changes?.before?.label;

  let description: string;
  if (entry.event === "page.label_replaced" && added && removed) {
    description = t("changed {{from}} to {{to}}", {
      from: describe(removed),
      to: describe(added),
    });
  } else if (entry.event === "page.label_removed" && removed) {
    description = t("removed {{label}}", { label: describe(removed) });
  } else if (added) {
    description = t("added {{label}}", { label: describe(added) });
  } else {
    return null;
  }

  return (
    <Group gap={8} wrap="nowrap" align="flex-start">
      <CustomAvatar
        avatarUrl={entry.actor?.avatarUrl ?? undefined}
        name={actorName}
        size={20}
        radius="xl"
      />
      <div style={{ minWidth: 0 }}>
        <Text size="xs">
          <Text component="span" fw={500}>
            {actorName}
          </Text>{" "}
          {description}
        </Text>
        <Text size="xs" c="dimmed">
          {timeAgo}
        </Text>
      </div>
    </Group>
  );
}
