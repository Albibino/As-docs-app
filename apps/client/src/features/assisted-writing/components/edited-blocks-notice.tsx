import { Alert, Button, Group, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import type { EditedBlock } from "../hooks/use-undo";

interface EditedBlocksNoticeProps {
  blocks: EditedBlock[];
  onRevertUntouched: () => void;
  onRestoreAll: () => void;
  onCancel: () => void;
}

/** Shown when undoing would also discard edits made after the AI's changes. */
export function EditedBlocksNotice({
  blocks,
  onRevertUntouched,
  onRestoreAll,
  onCancel,
}: EditedBlocksNoticeProps) {
  const { t } = useTranslation();
  return (
    <Alert color="orange" title={t("Content changed after the application")}>
      <Stack gap="xs">
        <Text size="sm">
          {t("Later edits that a full restore would discard:")}
        </Text>
        {blocks.map((block) => (
          <Text key={block.id} size="xs">
            {block.text}
          </Text>
        ))}
        <Group gap="xs">
          <Button size="xs" variant="light" color="orange" onClick={onRevertUntouched}>
            {t("Revert only untouched AI blocks")}
          </Button>
          <Button size="xs" color="orange" onClick={onRestoreAll}>
            {t("Restore the whole page")}
          </Button>
          <Button size="xs" variant="default" onClick={onCancel}>
            {t("Cancel")}
          </Button>
        </Group>
      </Stack>
    </Alert>
  );
}
