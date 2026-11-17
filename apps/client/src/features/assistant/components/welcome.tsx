import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Text, Title, UnstyledButton } from "@mantine/core";
import { IconEdit, IconFileText, IconSearch, IconSparkles } from "@tabler/icons-react";
import Composer, { type ComposerDraft } from "./composer";
import classes from "../styles/assistant.module.css";

type Props = {
  isStreaming: boolean;
  onSend: (text: string) => void;
  onStop: () => void;
};

/** Tela de conversa nova: saudação, caixa de pergunta e sugestões. */
export default function Welcome({ isStreaming, onSend, onStop }: Props) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState<ComposerDraft>();

  // A sugestão vai para a caixa para o usuário completar; não é enviada.
  const suggestions = [
    {
      icon: <IconSearch size={16} />,
      label: t("Search across all pages"),
      prompt: t("Which pages talk about "),
    },
    {
      icon: <IconFileText size={16} />,
      label: t("Summarize a page"),
      prompt: `${t("Summarize the page")} `,
    },
    {
      icon: <IconEdit size={16} />,
      label: t("Ask about a page"),
      prompt: `${t("In the page")} `,
    },
  ];

  return (
    <div className={classes.welcome}>
      <IconSparkles size={44} stroke={1.5} />
      <Text size="xs" fw={600} tt="uppercase" c="dimmed" mt="xs">
        {t("Docs AI")}
      </Text>
      <Title order={1} size="h2" ta="center" mb="xl">
        {t("What can I help you with?")}
      </Title>
      <div className={classes.welcomeComposer}>
        <Composer
          isStreaming={isStreaming}
          onSend={onSend}
          onStop={onStop}
          draft={draft}
        />
      </div>
      <div className={classes.welcomeComposer}>
        <Text size="xs" fw={500} c="dimmed" tt="uppercase" mb="xs">
          {t("Get started")}
        </Text>
        <div className={classes.suggestions}>
          {suggestions.map((item) => (
            <UnstyledButton
              key={item.label}
              className={classes.suggestion}
              onClick={() =>
                setDraft((current) => ({
                  text: item.prompt,
                  nonce: (current?.nonce ?? 0) + 1,
                }))
              }
            >
              {item.icon}
              <Text size="sm">{item.label}</Text>
            </UnstyledButton>
          ))}
        </div>
      </div>
    </div>
  );
}
