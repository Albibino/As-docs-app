import { ActionIcon, Popover, Text, Tooltip } from "@mantine/core";
import { IconHistory } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { usePagesEditedByMeQuery } from "@/features/page/queries/page-query";
import { HistoryDropdown } from "./history-dropdown";

export function HistoryButton() {
  const { t } = useTranslation();
  const [opened, setOpened] = useState(false);
  const toggle = () => setOpened((value) => !value);
  const close = () => setOpened(false);
  const query = usePagesEditedByMeQuery();
  const pages = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <Popover
      opened={opened}
      onChange={setOpened}
      width={340}
      position="bottom-start"
      shadow="md"
      withArrow
      /* The header is position: fixed, so absolute positioning makes the
         dropdown lag a frame behind every scroll step and visibly jump. */
      floatingStrategy="fixed"
    >
      <Popover.Target>
        <Tooltip label={t("Pages edited by me")} withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            size="lg"
            radius="xl"
            onClick={toggle}
            aria-label={t("Pages edited by me")}
            aria-expanded={opened}
          >
            <IconHistory size={20} />
          </ActionIcon>
        </Tooltip>
      </Popover.Target>
      <Popover.Dropdown p="sm">
        <Text size="sm" fw={600} mb="xs">
          {t("Pages edited by me")}
        </Text>
        <HistoryDropdown
          pages={pages}
          isLoading={query.isLoading}
          isError={query.isError}
          hasNextPage={Boolean(query.hasNextPage)}
          isFetchingNextPage={query.isFetchingNextPage}
          onLoadMore={() => query.fetchNextPage()}
          onNavigate={close}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
