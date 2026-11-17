import { useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Group,
  Menu,
  ScrollArea,
  Text,
  TextInput,
  getDefaultZIndex,
} from "@mantine/core";
import { IconChevronDown, IconTag } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  useAvailableLabelsQuery,
  useSearchableLabelsQuery,
} from "@/features/label/queries/label-query.ts";
import { LabelPathTooltip } from "@/features/label/components/label-path-tooltip.tsx";
import { flattenSearchLabelTree } from "@/features/search/utils/search-label-options.ts";
import type { SearchLabelOption } from "@/features/search/utils/search-label-options.ts";
import classes from "./search-spotlight-filters.module.css";

type TaxonomyFilter = { treeId: string; nodeIds: string[] };

type SearchLabelFilterProps = {
  /** Contains node ids for checkbox state and free-tag ids. */
  value: string[];
  taxonomyFilters: TaxonomyFilter[];
  onChange: (labelIds: string[], taxonomyFilters: TaxonomyFilter[]) => void;
  spaceId?: string | null;
};

type SearchSection = {
  title: string;
  treeId?: string;
  labels: SearchLabelOption[];
};

export function SearchLabelFilter({
  value,
  taxonomyFilters,
  onChange,
  spaceId,
}: SearchLabelFilterProps) {
  const { t } = useTranslation();
  const searchableQuery = useSearchableLabelsQuery(!spaceId);
  const availableQuery = useAvailableLabelsQuery(
    spaceId ?? undefined,
    !!spaceId,
  );
  const data = spaceId ? availableQuery.data : searchableQuery.data;
  const [opened, setOpened] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(() => new Set(value), [value]);
  const needle = query.trim().toLowerCase();

  const sections = useMemo<SearchSection[]>(() => {
    if (!data) return [];
    const grouped = data.trees.flatMap((tree) => {
      const labels = flattenSearchLabelTree(tree);
      const treeMatches = tree.name.toLowerCase().includes(needle);
      const visibleLabels =
        !needle || treeMatches
          ? labels
          : labels.filter((label) =>
              label.searchText.toLowerCase().includes(needle),
            );

      return treeMatches || visibleLabels.length
        ? [{ title: tree.name, treeId: tree.id, labels: visibleLabels }]
        : [];
    });
    const freeLabels = data.freeLabels.filter(
      (label) => !needle || label.name.toLowerCase().includes(needle),
    );

    return freeLabels.length
      ? [
          ...grouped,
          {
            title: t("Other"),
            labels: freeLabels.map((label) => ({
              id: label.id,
              displayName: label.name,
              searchText: label.name,
            })),
          },
        ]
      : grouped;
  }, [data, needle, t]);

  const emit = (nextIds: string[], nextFilters: TaxonomyFilter[]) => {
    onChange([...new Set(nextIds)], nextFilters);
  };

  const toggle = (labelId: string) => {
    const next = selected.has(labelId)
      ? value.filter((id) => id !== labelId)
      : [...value, labelId];
    const tree = data?.trees.find((item) =>
      item.nodes.some((node) => node.id === labelId),
    );
    if (!tree) return emit(next, taxonomyFilters);
    const current = taxonomyFilters.find((filter) => filter.treeId === tree.id);
    const nodeIds = next.filter((id) =>
      tree.nodes.some((node) => node.id === id),
    );
    const nextFilters = [
      ...taxonomyFilters.filter((filter) => filter.treeId !== tree.id),
      ...(nodeIds.length || current?.nodeIds.length === 0
        ? [{ treeId: tree.id, nodeIds }]
        : []),
    ];
    emit(next, nextFilters);
  };

  const toggleTree = (treeId: string) => {
    const tree = data?.trees.find((item) => item.id === treeId);
    if (!tree) return;
    const current = taxonomyFilters.find((filter) => filter.treeId === treeId);
    if (current?.nodeIds.length === 0) {
      return emit(
        value.filter((id) => !tree.nodes.some((node) => node.id === id)),
        taxonomyFilters.filter((filter) => filter.treeId !== treeId),
      );
    }
    emit(
      value.filter((id) => !tree.nodes.some((node) => node.id === id)),
      [
        ...taxonomyFilters.filter((filter) => filter.treeId !== treeId),
        { treeId, nodeIds: [] },
      ],
    );
  };

  const clear = () => onChange([], []);
  const filterCount = value.length || taxonomyFilters.length;
  if (!data) return null;

  const hasVisibleLabels = sections.some(
    (section) => section.labels.length > 0,
  );
  const closeMenu = (nextOpened: boolean) => {
    setOpened(nextOpened);
    if (!nextOpened) setQuery("");
  };

  return (
    <Menu
      opened={opened}
      onChange={closeMenu}
      shadow="md"
      width="max-content"
      position="bottom-start"
      closeOnItemClick={false}
      zIndex={getDefaultZIndex("max")}
    >
      <Menu.Target>
        <Button
          variant="subtle"
          color="gray"
          size="sm"
          rightSection={<IconChevronDown size={14} />}
          leftSection={<IconTag size={16} />}
          className={classes.filterButton}
          fw={500}
        >
          {filterCount
            ? `${t("Labels")}: ${filterCount}`
            : `${t("Labels")}: ${t("All")}`}
        </Button>
      </Menu.Target>
      <Menu.Dropdown className={classes.labelFilterDropdown}>
        <TextInput
          className={classes.labelFilterSearch}
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              closeMenu(false);
            }
          }}
          placeholder={t("Search labels")}
          aria-label={t("Search labels")}
          size="sm"
          autoFocus
        />
        <Menu.Divider />
        <ScrollArea.Autosize mah={340}>
          {filterCount > 0 && (
            <>
              <Menu.Item onClick={clear}>
                <Text size="sm" c="dimmed">
                  {t("Clear selection")}
                </Text>
              </Menu.Item>
              <Menu.Divider />
            </>
          )}
          {sections.map((section) => {
            const treeFilter = section.treeId
              ? taxonomyFilters.find(
                  (filter) => filter.treeId === section.treeId,
                )
              : undefined;
            const wholeTree = !!treeFilter && treeFilter.nodeIds.length === 0;
            return (
              <div key={section.title}>
                <Menu.Label>
                  {section.treeId ? (
                    <Group gap="xs" wrap="nowrap">
                      <Checkbox
                        size="xs"
                        checked={wholeTree}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggleTree(section.treeId!)}
                        aria-label={t("Filter this whole tree")}
                      />
                      <LabelPathTooltip
                        name={section.title}
                        path={section.title}
                        ariaLabel={section.title}
                        className={classes.labelFilterSectionTitle}
                      >
                        <Text component="span" size="xs">
                          {section.title}
                        </Text>
                      </LabelPathTooltip>
                    </Group>
                  ) : (
                    section.title
                  )}
                </Menu.Label>
                {section.labels.map((label) => (
                  <Menu.Item
                    key={label.id}
                    onClick={() => toggle(label.id)}
                    role="menuitemcheckbox"
                    aria-checked={wholeTree || selected.has(label.id)}
                  >
                    <Group
                      gap="xs"
                      wrap="nowrap"
                      className={classes.labelFilterRow}
                    >
                      <Checkbox
                        checked={wholeTree || selected.has(label.id)}
                        onClick={(event) => event.stopPropagation()}
                        onChange={() => toggle(label.id)}
                        size="xs"
                        tabIndex={-1}
                        aria-hidden
                      />
                      <LabelPathTooltip
                        name={label.displayName}
                        path={label.displayName}
                        ariaLabel={label.displayName}
                        className={classes.labelFilterText}
                      >
                        <Text component="span" size="sm">
                          {label.displayName}
                        </Text>
                      </LabelPathTooltip>
                    </Group>
                  </Menu.Item>
                ))}
              </div>
            );
          })}
          {!hasVisibleLabels && (
            <Text className={classes.labelFilterEmpty} size="sm" c="dimmed">
              {needle ? t("No matches") : t("No labels yet")}
            </Text>
          )}
        </ScrollArea.Autosize>
      </Menu.Dropdown>
    </Menu>
  );
}
