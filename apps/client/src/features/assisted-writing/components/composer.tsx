import { ActionIcon, Stack, Text, Textarea } from "@mantine/core";
import { IconArrowUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import classes from "../assisted-writing.module.css";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  busy: boolean;
  /** The request will be limited to the selected blocks. */
  focusedOnSelection: boolean;
}

export function Composer({
  value,
  onChange,
  onSubmit,
  busy,
  focusedOnSelection,
}: ComposerProps) {
  const { t } = useTranslation();
  const canSend = value.trim().length > 0 && !busy;

  return (
    <Stack gap={6} className={classes.composer}>
      <Textarea
        autosize
        minRows={2}
        maxRows={6}
        value={value}
        disabled={busy}
        placeholder={
          focusedOnSelection
            ? t("Ask for a change to the selection or page…")
            : t("Ask for a change on this page…")
        }
        rightSectionWidth={40}
        rightSection={
          <ActionIcon
            radius="xl"
            aria-label={t("Send request")}
            disabled={!canSend}
            onClick={onSubmit}
          >
            <IconArrowUp size={16} />
          </ActionIcon>
        }
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            if (canSend) onSubmit();
          }
        }}
      />
      <Text size="xs" c="dimmed">
        {t("The AI can make mistakes. Always review before accepting.")}
      </Text>
    </Stack>
  );
}
