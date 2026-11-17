import {
  Button,
  Collapse,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronRight, IconStar } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useFavoritesQuery } from "@/features/favorite/queries/favorite-query";
import { PageListIcon } from "@/components/common/page-list-icon";
import { buildPageUrl, getPageTitle } from "@/features/page/page.utils";
import { CollapsedSectionPopover } from "@/components/layouts/global/collapsed-section-popover";
import classes from "./sidebar-favorites.module.css";

function useSpaceFavorites(spaceId: string) {
  const query = useFavoritesQuery("page", spaceId);
  const favorites =
    query.data?.pages.flatMap((page) => page.items).filter((item) => item.page) ??
    [];
  return { query, favorites };
}

type FavoritesQuery = ReturnType<typeof useSpaceFavorites>;

function FavoritesList({ query, favorites }: FavoritesQuery) {
  const { t } = useTranslation();

  if (query.isLoading) {
    return (
      <Group justify="center" py="xs">
        <Loader size="xs" />
      </Group>
    );
  }

  return (
    <Stack gap={1} mt={4}>
      {favorites.map((favorite) => {
        const page = favorite.page!;
        return (
          <UnstyledButton
            key={favorite.id}
            component={Link}
            className={classes.item}
            to={buildPageUrl(favorite.space?.slug, page.slugId, page.title)}
          >
            <Group gap="xs" wrap="nowrap" className={classes.itemInner}>
              <PageListIcon icon={page.icon} isBase={page.isBase} />
              <Text size="sm" truncate>
                {getPageTitle(page.title, page.isBase, t)}
              </Text>
            </Group>
          </UnstyledButton>
        );
      })}
      {query.hasNextPage && (
        <Button
          variant="subtle"
          size="compact-xs"
          loading={query.isFetchingNextPage}
          onClick={() => query.fetchNextPage()}
        >
          {t("Load more")}
        </Button>
      )}
    </Stack>
  );
}

export function SidebarFavorites({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const [opened, { toggle }] = useDisclosure(true);
  const { query, favorites } = useSpaceFavorites(spaceId);

  if (!query.isLoading && favorites.length === 0) return null;

  return (
    <div className={classes.section}>
      <UnstyledButton
        className={classes.header}
        onClick={toggle}
        aria-expanded={opened}
      >
        <Group gap={6} wrap="nowrap">
          {opened ? <IconChevronDown size={14} /> : <IconChevronRight size={14} />}
          <IconStar size={14} />
          <Text component="span" className={classes.headerLabel}>
            {t("Favorites")}
          </Text>
        </Group>
      </UnstyledButton>

      <Collapse expanded={opened}>
        <FavoritesList query={query} favorites={favorites} />
      </Collapse>
    </div>
  );
}

/**
 * Collapsed-sidebar counterpart: a star icon that opens the favorites list in a
 * popup. Hidden when the space has no favorites, matching the expanded state.
 */
export function SidebarFavoritesCollapsed({ spaceId }: { spaceId: string }) {
  const { t } = useTranslation();
  const { query, favorites } = useSpaceFavorites(spaceId);

  if (!query.isLoading && favorites.length === 0) return null;

  return (
    <CollapsedSectionPopover label={t("Favorites")} icon={IconStar}>
      <ScrollArea.Autosize mah={320} type="auto" scrollbarSize={6}>
        <FavoritesList query={query} favorites={favorites} />
      </ScrollArea.Autosize>
    </CollapsedSectionPopover>
  );
}
