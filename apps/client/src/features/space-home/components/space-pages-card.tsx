import {
  Alert,
  Card,
  Group,
  Loader,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconAlertCircle } from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { IPage } from "@/features/page/types/page.types";
import { PageListIcon } from "@/components/common/page-list-icon";
import { buildPageUrl, getPageTitle } from "@/features/page/page.utils";
import classes from "./space-home.module.css";

/** Lista das páginas de primeiro nível do space, na home do space. */
export function SpacePagesCard({
  spaceSlug,
  pages,
  isLoading,
  isError,
}: {
  spaceSlug: string;
  pages: IPage[];
  isLoading: boolean;
  isError: boolean;
}) {
  const { t } = useTranslation();

  return (
    <Card withBorder radius="md" padding="md">
      <Stack gap="sm">
        <Text fw={600}>{t("Space pages")}</Text>
        {isLoading ? (
          <Group justify="center" py="lg">
            <Loader size="sm" />
          </Group>
        ) : isError ? (
          <Alert color="red" icon={<IconAlertCircle size={16} />}>
            {t("This block could not be loaded")}
          </Alert>
        ) : (
          <Stack gap={2}>
            {pages.map((page) => (
              <UnstyledButton
                key={page.id}
                component={Link}
                to={buildPageUrl(spaceSlug, page.slugId, page.title)}
                className={classes.pageRow}
              >
                <Group gap="sm" wrap="nowrap">
                  <PageListIcon icon={page.icon} isBase={page.isBase} />
                  <Text size="sm" truncate>
                    {getPageTitle(page.title, page.isBase, t)}
                  </Text>
                </Group>
              </UnstyledButton>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}
