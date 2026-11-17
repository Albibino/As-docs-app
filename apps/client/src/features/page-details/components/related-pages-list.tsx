import { Divider, Stack, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import { extractPageSlugId } from "@/lib";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { useBacklinksCountQuery } from "@/features/page-details/queries/backlinks-query.ts";
import { BacklinksList } from "./backlinks-list";

interface RelatedPagesListProps {
  enabled: boolean;
}

export function RelatedPagesList({ enabled }: RelatedPagesListProps) {
  const { t } = useTranslation();
  const { pageSlug } = useParams();
  const { data: page } = usePageQuery({
    pageId: extractPageSlugId(pageSlug),
  });
  const { data: counts } = useBacklinksCountQuery(page?.id, enabled);

  if (!page) return null;

  return (
    <Stack gap="md">
      <Stack gap={4}>
        <Text size="xs" fw={500} c="dimmed">
          {t("Cited by ({{count}})", { count: counts?.incoming ?? 0 })}
        </Text>
        <BacklinksList
          pageId={page.id}
          direction="incoming"
          enabled={enabled}
        />
      </Stack>

      <Divider />

      <Stack gap={4}>
        <Text size="xs" fw={500} c="dimmed">
          {t("Cites ({{count}})", { count: counts?.outgoing ?? 0 })}
        </Text>
        <BacklinksList
          pageId={page.id}
          direction="outgoing"
          enabled={enabled}
        />
      </Stack>
    </Stack>
  );
}
