import {
  Alert,
  Badge,
  Button,
  Group,
  Paper,
  SimpleGrid,
  Stack,
  Text,
} from "@mantine/core";
import {
  IconAlertTriangle,
  IconArrowLeft,
  IconUpload,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { formatBytes } from "@/lib";
import {
  FolderImportEntryKind,
  FolderImportScanResult,
} from "./folder-import-scanner";

interface FolderImportPreviewProps {
  scan: FolderImportScanResult;
  onBack: () => void;
  onConfirm: () => void;
}

export function FolderImportPreview({
  scan,
  onBack,
  onConfirm,
}: FolderImportPreviewProps) {
  const { t } = useTranslation();
  const counts = countKinds(scan);
  const blocked = scan.blockingIssues.length;

  return (
    <Stack gap="md">
      <div>
        <Text fw={600} size="lg">
          {scan.rootName}
        </Text>
        <Text size="sm" c="dimmed">
          {t("Review what will be created before sending any files.")}
        </Text>
      </div>

      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <SummaryValue
          value={scan.summary.totalEntries}
          label={t(
            scan.summary.totalEntries === 1
              ? "{{count}} file"
              : "{{count}} files",
            { count: scan.summary.totalEntries },
          )}
        />
        <SummaryValue
          value={scan.summary.duplicateEntries}
          label={t(
            scan.summary.duplicateEntries === 1
              ? "{{count}} duplicate"
              : "{{count}} duplicates",
            { count: scan.summary.duplicateEntries },
          )}
        />
        <SummaryValue
          value={scan.summary.ignoredEntries}
          label={t("{{count}} ignored", {
            count: scan.summary.ignoredEntries,
          })}
        />
        <SummaryValue
          value={formatBytes(scan.summary.effectiveBytes)}
          label={t("to upload")}
        />
      </SimpleGrid>

      <Paper withBorder p="sm">
        <Group gap="xs">
          <Badge variant="light">
            {counts.document} {t("documents")}
          </Badge>
          <Badge variant="light">{counts.pdf} PDF</Badge>
          <Badge variant="light">
            {counts.image} {t("images")}
          </Badge>
          <Badge variant="light">
            {counts.video} {t("videos")}
          </Badge>
          <Badge variant="light">
            {counts.attachment} {t("other files")}
          </Badge>
        </Group>
      </Paper>

      {blocked > 0 && (
        <Alert color="red" icon={<IconAlertTriangle size={18} />}>
          {t(
            blocked === 1
              ? "{{count}} file exceeds 100 MB"
              : "{{count}} files exceed 100 MB",
            { count: blocked },
          )}
          <Text component="div" size="xs" mt={4}>
            {scan.blockingIssues
              .slice(0, 3)
              .map((issue) => issue.relativePath)
              .join(", ")}
          </Text>
        </Alert>
      )}

      <Group justify="space-between">
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
        >
          {t("Choose another folder")}
        </Button>
        <Button
          leftSection={<IconUpload size={16} />}
          disabled={blocked > 0 || scan.summary.importableEntries === 0}
          onClick={onConfirm}
        >
          {t("Import folder")}
        </Button>
      </Group>
    </Stack>
  );
}

function SummaryValue({
  value,
  label,
}: {
  value: React.ReactNode;
  label: string;
}) {
  return (
    <Paper withBorder p="sm">
      <Text fw={600}>{value}</Text>
      <Text size="xs" c="dimmed">
        {label}
      </Text>
    </Paper>
  );
}

function countKinds(scan: FolderImportScanResult) {
  const counts = { document: 0, pdf: 0, image: 0, video: 0, attachment: 0 };
  for (const entry of scan.entries) {
    if (entry.kind in counts) counts[entry.kind as keyof typeof counts]++;
  }
  return counts;
}
