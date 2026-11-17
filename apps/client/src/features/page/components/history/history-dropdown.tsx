import { Alert, Button, Group, Loader, ScrollArea, Stack, Text, UnstyledButton } from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IPage } from "@/features/page/types/page.types";
import { PageListIcon } from "@/components/common/page-list-icon";
import { buildPageUrl, getPageTitle } from "@/features/page/page.utils";
import classes from "./history-dropdown.module.css";

interface HistoryDropdownProps {
  pages: IPage[];
  isLoading: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  onLoadMore: () => void;
  onNavigate: () => void;
}

export function HistoryDropdown({
  pages,
  isLoading,
  isError,
  hasNextPage,
  isFetchingNextPage,
  onLoadMore,
  onNavigate,
}: HistoryDropdownProps) {
  const { t } = useTranslation();

  if (isLoading) {
    return (
      <Group justify="center" p="lg">
        <Loader size="sm" />
      </Group>
    );
  }

  if (isError) {
    return (
      <Alert color="red" icon={<IconAlertCircle size={16} />}>
        {t("Failed to load history")}
      </Alert>
    );
  }

  if (pages.length === 0) {
    return (
      <Text size="sm" c="dimmed" ta="center" p="lg">
        {t("You have not edited any pages yet")}
      </Text>
    );
  }

  return (
    <ScrollArea.Autosize
      mah={420}
      type="auto"
      scrollbars="y"
      overscrollBehavior="contain"
      classNames={{ viewport: classes.viewport, content: classes.content }}
    >
      <Stack gap={2}>
        {pages.map((page) => (
          <UnstyledButton
            key={page.id}
            component={Link}
            to={buildPageUrl(page.space?.slug, page.slugId, page.title)}
            onClick={onNavigate}
            p="xs"
            style={{ borderRadius: "var(--mantine-radius-sm)" }}
          >
            <Group gap="sm" wrap="nowrap">
              <span style={{ flexShrink: 0, display: "flex" }}>
                <PageListIcon icon={page.icon} isBase={page.isBase} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text size="sm" fw={500} truncate>
                  {getPageTitle(page.title, page.isBase, t)}
                </Text>
                {page.space?.name && (
                  <Text size="xs" c="dimmed" truncate>
                    {page.space.name}
                  </Text>
                )}
              </div>
            </Group>
          </UnstyledButton>
        ))}
        {hasNextPage && (
          <Button
            variant="subtle"
            size="xs"
            loading={isFetchingNextPage}
            onClick={onLoadMore}
          >
            {t("Load more")}
          </Button>
        )}
      </Stack>
    </ScrollArea.Autosize>
  );
}
