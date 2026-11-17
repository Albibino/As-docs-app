import {
  Alert,
  Button,
  Group,
  Loader,
  Paper,
  Progress,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import { IconAlertCircle, IconCheck, IconRefresh } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { FolderImportResult } from "./folder-import-service";

interface FolderImportStatusProps {
  stage: "uploading" | "processing" | "done";
  uploadProgress: { uploaded: number; total: number };
  result: FolderImportResult | null;
  onCancel: () => void;
  onRetry: () => void;
  onNewImport: () => void;
}

export function FolderImportStatus({
  stage,
  uploadProgress,
  result,
  onCancel,
  onRetry,
  onNewImport,
}: FolderImportStatusProps) {
  const { t } = useTranslation();

  if (stage === "uploading") {
    const value = uploadProgress.total
      ? (uploadProgress.uploaded / uploadProgress.total) * 100
      : 0;
    return (
      <Stack gap="md" aria-live="polite">
        <Text fw={600} size="lg">
          {t("Uploading folder")}
        </Text>
        <Progress value={value} animated />
        <Text size="sm" c="dimmed">
          {t("{{uploaded}} of {{total}} files uploaded", uploadProgress)}
        </Text>
        <Group justify="flex-end">
          <Button variant="subtle" color="red" onClick={onCancel}>
            {t("Cancel import")}
          </Button>
        </Group>
      </Stack>
    );
  }

  if (stage === "processing") {
    return (
      <Stack align="center" gap="sm" py="xl" aria-live="polite">
        <Loader size="sm" />
        <Text fw={600}>{t("Processing folder")}</Text>
        <Text size="sm" c="dimmed" ta="center">
          {t("You can close this window and return later. Progress is saved.")}
        </Text>
        <Button variant="subtle" color="red" onClick={onCancel}>
          {t("Cancel import")}
        </Button>
      </Stack>
    );
  }

  const report = result?.report;
  const status = result?.session.status;
  const needsRetry = status === "partial" || status === "failed";
  return (
    <Stack gap="md" aria-live="polite">
      <Alert
        color={status === "success" ? "teal" : needsRetry ? "yellow" : "gray"}
        icon={
          status === "success" ? (
            <IconCheck size={18} />
          ) : (
            <IconAlertCircle size={18} />
          )
        }
        title={
          status === "success"
            ? t("Folder import complete")
            : needsRetry
              ? t("Folder import completed with issues")
              : t("Folder import cancelled")
        }
      >
        {needsRetry
          ? t("Completed items were kept. You can retry only the failed files.")
          : t("The import report is available below.")}
      </Alert>
      {report && (
        <SimpleGrid cols={{ base: 2, sm: 4 }}>
          <ReportValue value={report.imported} label={t("imported")} />
          <ReportValue value={report.duplicates} label={t("duplicates")} />
          <ReportValue value={report.ignored} label={t("ignored")} />
          <ReportValue value={report.failed} label={t("failed")} />
        </SimpleGrid>
      )}
      <Group justify="flex-end">
        <Button variant="default" onClick={onNewImport}>
          {t("New import")}
        </Button>
        {needsRetry && (
          <Button leftSection={<IconRefresh size={16} />} onClick={onRetry}>
            {t("Retry failed files")}
          </Button>
        )}
      </Group>
    </Stack>
  );
}

function ReportValue({ value, label }: { value: number; label: string }) {
  return (
    <Paper withBorder p="sm">
      <Text fw={600}>{value}</Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  );
}
