import { Alert, Button, Group, Progress, Stack, Text } from "@mantine/core";
import { IconArrowLeft, IconFolder, IconTrash } from "@tabler/icons-react";
import { ChangeEvent } from "react";
import { useTranslation } from "react-i18next";

interface FolderImportSelectProps {
  scanning: boolean;
  progress: { completed: number; total: number };
  resumeName?: string;
  discarding?: boolean;
  error?: string | null;
  onFiles: (files: File[]) => void;
  onDiscard?: () => void;
  onBack: () => void;
}

export function FolderImportSelect({
  scanning,
  progress,
  resumeName,
  discarding,
  error,
  onFiles,
  onDiscard,
  onBack,
}: FolderImportSelectProps) {
  const { t } = useTranslation();
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = [...(event.currentTarget.files ?? [])];
    event.currentTarget.value = "";
    if (files.length) onFiles(files);
  };
  const percentage = progress.total
    ? (progress.completed / progress.total) * 100
    : 0;

  return (
    <Stack gap="md">
      <div>
        <Text fw={600} size="lg">
          {t("Import a folder")}
        </Text>
        <Text size="sm" c="dimmed">
          {t(
            "Folders become pages, documents stay editable, and media is grouped automatically.",
          )}
        </Text>
      </div>
      {resumeName && (
        <Alert color="blue" title={t("Upload ready to resume")}>
          <Stack gap="xs" align="flex-start">
            <Text size="sm">
              {t(
                "Choose {{name}} again. Files already uploaded will be skipped.",
                { name: resumeName },
              )}
            </Text>
            {onDiscard && (
              <Button
                variant="subtle"
                color="red"
                size="compact-sm"
                leftSection={<IconTrash size={16} />}
                onClick={onDiscard}
                loading={discarding}
                disabled={scanning}
              >
                {t("Discard this upload and import another folder")}
              </Button>
            )}
          </Stack>
        </Alert>
      )}
      {error && <Alert color="red">{error}</Alert>}
      <Button
        component="label"
        variant="default"
        leftSection={<IconFolder size={18} />}
        loading={scanning}
        disabled={discarding}
      >
        {scanning ? t("Checking files") : t("Choose a folder")}
        <input
          hidden
          type="file"
          multiple
          aria-label={t("Choose a folder")}
          onChange={handleChange}
          {...({
            webkitdirectory: "",
          } as React.InputHTMLAttributes<HTMLInputElement>)}
        />
      </Button>
      {scanning && (
        <div aria-live="polite">
          <Progress value={percentage} animated />
          <Text size="xs" c="dimmed" mt={6}>
            {t("Calculating file hashes: {{completed}} of {{total}}", progress)}
          </Text>
        </div>
      )}
      <Text size="xs" c="dimmed">
        {t(
          "Nothing is sent until you review and confirm the preview. Maximum 100 MB per file.",
        )}
      </Text>
      <Group justify="flex-start">
        <Button
          variant="subtle"
          color="gray"
          leftSection={<IconArrowLeft size={16} />}
          onClick={onBack}
          disabled={scanning || discarding}
        >
          {t("Back")}
        </Button>
      </Group>
    </Stack>
  );
}
