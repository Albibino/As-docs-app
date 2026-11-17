import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Alert, Anchor, Badge, Group, List, Stack, Text } from "@mantine/core";
import {
  IconAlertTriangle,
  IconFileText,
  IconSearchOff,
} from "@tabler/icons-react";
import type { AnswerMeta, PageRef } from "../types/assistant.types";
import { pageHref } from "../utils/assistant-paths";

function PageLink({ page }: { page: PageRef }) {
  const { t } = useTranslation();
  const href = pageHref(page);
  const title = page.title || t("Untitled");
  return href ? (
    <Anchor component={Link} to={href} size="sm">
      {title}
    </Anchor>
  ) : (
    <Text span size="sm">
      {title}
    </Text>
  );
}

type Props = { meta: AnswerMeta | null | undefined };

/**
 * Rodapé da resposta:
 * - aviso de defasagem, quando o índice estava atrás da versão atual;
 * - "não encontrei" com as páginas semelhantes;
 * - fontes numeradas, na ordem das citações [n].
 */
export default function AnswerDetails({ meta }: Props) {
  const { t } = useTranslation();
  if (!meta) return null;

  const stale = meta.stalePages ?? [];
  const sources = meta.sources ?? [];
  const similar = meta.similar ?? [];
  const notFound = meta.found === false;
  if (!stale.length && !sources.length && !notFound) return null;

  return (
    <Stack gap="xs" mt="sm" data-testid="assistant-answer-details">
      {stale.length > 0 && (
        <Alert
          color="yellow"
          variant="light"
          p="xs"
          icon={<IconAlertTriangle size={16} />}
          data-testid="assistant-stale-notice"
        >
          <Text size="xs">
            {t(
              "Some documents changed after they were indexed. The current version was read directly from the application:",
            )}{" "}
            {stale.map((page, index) => (
              <span key={page.pageId}>
                {index > 0 && ", "}
                <strong>{page.title || t("Untitled")}</strong>{" "}
                {t("(indexed v{{indexed}}, current v{{current}})", {
                  indexed: page.indexedVersion ?? 0,
                  current: page.currentVersion,
                })}
              </span>
            ))}
          </Text>
        </Alert>
      )}

      {notFound && (
        <div data-testid="assistant-not-found">
          <Group gap={6} wrap="nowrap" mb={4}>
            <IconSearchOff size={16} />
            <Text size="sm" fw={500}>
              {t("I couldn't find this in the documents.")}
            </Text>
          </Group>
          {similar.length > 0 ? (
            <>
              <Text size="xs" c="dimmed" fw={600}>
                {t("Similar pages:")}
              </Text>
              <List
                size="sm"
                spacing={2}
                listStyleType="none"
                icon={<IconFileText size={13} />}
              >
                {similar.map((page) => (
                  <List.Item key={page.pageId}>
                    <PageLink page={page} />
                  </List.Item>
                ))}
              </List>
            </>
          ) : (
            <Text size="xs" c="dimmed">
              {t("No similar pages were found either.")}
            </Text>
          )}
        </div>
      )}

      {!notFound && sources.length > 0 && (
        <div data-testid="assistant-sources">
          <Text size="xs" c="dimmed" fw={600}>
            {t("Sources")}
          </Text>
          <List type="ordered" size="sm" spacing={2} listStyleType="none">
            {sources.map((source, index) => (
              <List.Item key={`${source.pageId}-${index}`}>
                <Text span size="xs" c="dimmed">
                  [{source.n ?? index + 1}]
                </Text>{" "}
                <PageLink page={source} />
                {source.origin === "mcp_read" && (
                  <Badge ml={6} size="xs" variant="light" color="yellow">
                    {t("current version v{{version}}", {
                      version: source.version,
                    })}
                  </Badge>
                )}
              </List.Item>
            ))}
          </List>
        </div>
      )}
    </Stack>
  );
}
