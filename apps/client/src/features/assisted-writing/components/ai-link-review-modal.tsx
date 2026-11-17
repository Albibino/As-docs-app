import {
  Alert,
  Button,
  Checkbox,
  Group,
  Modal,
  Stack,
  Text,
} from "@mantine/core";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type {
  LinkDecision,
  PageLink,
  PageLinkChange,
} from "../domain/page-links";

interface AiLinkReviewModalProps {
  opened: boolean;
  changes: PageLinkChange[];
  onCancel: () => void;
  onConfirm: (decisions: LinkDecision[]) => void;
}

interface DecisionRow {
  key: string;
  change: PageLinkChange;
  link: PageLink;
  kind: "added" | "removed";
}

function buildRows(changes: PageLinkChange[]): DecisionRow[] {
  return changes.flatMap((change, index) => [
    ...change.removed.map((link) => ({
      key: `${index}:removed:${link.entityId}`,
      change,
      link,
      kind: "removed" as const,
    })),
    ...change.added.map((link) => ({
      key: `${index}:added:${link.entityId}`,
      change,
      link,
      kind: "added" as const,
    })),
  ]);
}

function rowDescription(
  row: DecisionRow,
  t: (key: string, options?: Record<string, unknown>) => string,
): string {
  const title = row.link.label || t("untitled page");
  if (row.kind === "added") return t('Create link to "{{title}}"', { title });
  return row.change.operation.action === "delete"
    ? t('Keep link to "{{title}}" (cancels the block removal)', { title })
    : t('Keep link to "{{title}}"', { title });
}

/**
 * Last gate before a proposal touches the page's link graph. Every box starts
 * checked: keeping links is the safe default, since the model dropping one
 * silently is exactly the failure this review exists to catch.
 */
export function AiLinkReviewModal({
  opened,
  changes,
  onCancel,
  onConfirm,
}: AiLinkReviewModalProps) {
  const { t } = useTranslation();
  const rows = buildRows(changes);
  const [keptKeys, setKeptKeys] = useState<string[]>([]);

  useEffect(() => {
    if (opened) setKeptKeys(buildRows(changes).map((row) => row.key));
  }, [opened, changes]);

  const kept = new Set(keptKeys);
  const toggle = (key: string) =>
    setKeptKeys((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    );

  const confirm = () =>
    onConfirm(
      rows.map((row) => ({
        operation: row.change.operation,
        link: row.link,
        kind: row.kind,
        keep: kept.has(row.key),
      })),
    );

  const removedCount = changes.reduce(
    (total, change) => total + change.removed.length,
    0,
  );

  return (
    <Modal
      opened={opened}
      onClose={onCancel}
      title={t("Links between pages")}
      centered
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "This proposal changes the links on this page. Checked links still exist after applying.",
          )}
        </Text>
        {removedCount > 0 && (
          <Alert color="orange">
            {t(
              "The AI removed {{total}} existing link(s). Uncheck only if the removal is intentional.",
              { total: removedCount },
            )}
          </Alert>
        )}
        {rows.map((row) => (
          <Checkbox
            key={row.key}
            checked={kept.has(row.key)}
            onChange={() => toggle(row.key)}
            label={rowDescription(row, t)}
            description={t("Block {{id}}", { id: row.change.blockId })}
          />
        ))}
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={onCancel}>
            {t("Cancel")}
          </Button>
          <Button onClick={confirm}>{t("Apply")}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
