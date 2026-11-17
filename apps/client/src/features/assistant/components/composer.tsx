import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, Badge, CloseButton, Group, Text, Textarea } from "@mantine/core";
import { IconArrowUp, IconFileText, IconPlayerStopFilled } from "@tabler/icons-react";
import classes from "../styles/assistant.module.css";

export type ComposerDraft = { text: string; nonce: number };

type Props = {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  /** Página aberta, enviada como contexto da pergunta. */
  contextPage?: { id: string; title: string } | null;
  onRemoveContext?: () => void;
  /** Texto colocado na caixa para o usuário completar (muda `nonce` a cada vez). */
  draft?: ComposerDraft;
  showDisclaimer?: boolean;
};

/** Caixa de pergunta: Enter envia, Shift+Enter quebra a linha. */
export default function Composer({
  isStreaming,
  onSend,
  onStop,
  placeholder,
  autoFocus = true,
  disabled = false,
  contextPage,
  onRemoveContext,
  draft,
  showDisclaimer = true,
}: Props) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const label = placeholder ?? t("Ask anything...");
  const canSend = value.trim().length > 0 && !disabled && !isStreaming;

  useEffect(() => {
    if (!draft) return;
    setValue(draft.text);
    const el = inputRef.current;
    if (el) {
      el.focus();
      const end = draft.text.length;
      el.setSelectionRange(end, end);
    }
  }, [draft?.nonce]);

  const submit = () => {
    if (!canSend) return;
    onSend(value.trim());
    setValue("");
  };

  return (
    <div>
      <div className={classes.composer}>
        {contextPage && (
          <Group gap={6} mb={6}>
            <Badge
              variant="light"
              color="gray"
              size="lg"
              tt="none"
              fw={500}
              leftSection={<IconFileText size={12} />}
              rightSection={
                onRemoveContext && (
                  <CloseButton
                    size="xs"
                    variant="transparent"
                    onClick={onRemoveContext}
                    aria-label={t("Remove {{name}} from context", {
                      name: contextPage.title || t("Untitled"),
                    })}
                  />
                )
              }
            >
              {contextPage.title || t("Untitled")}
            </Badge>
          </Group>
        )}
        <Group gap="xs" align="flex-end" wrap="nowrap">
          <Textarea
            ref={inputRef}
            style={{ flex: 1 }}
            variant="unstyled"
            autosize
            minRows={1}
            maxRows={8}
            maxLength={4000}
            placeholder={label}
            aria-label={label}
            data-autofocus={autoFocus || undefined}
            autoFocus={autoFocus}
            value={value}
            onChange={(event) => setValue(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                submit();
              }
            }}
          />
          {isStreaming ? (
            <ActionIcon
              radius="xl"
              color="dark"
              aria-label={t("Stop generation")}
              data-testid="assistant-stop"
              onClick={onStop}
            >
              <IconPlayerStopFilled size={14} />
            </ActionIcon>
          ) : (
            <ActionIcon
              radius="xl"
              color="dark"
              aria-label={t("Send message")}
              data-testid="assistant-send"
              disabled={!canSend}
              onClick={submit}
            >
              <IconArrowUp size={16} />
            </ActionIcon>
          )}
        </Group>
      </div>
      {showDisclaimer && (
        <Text size="xs" c="dimmed" ta="center" mt={6}>
          {t("AI-generated content may not be accurate.")}
        </Text>
      )}
    </div>
  );
}
