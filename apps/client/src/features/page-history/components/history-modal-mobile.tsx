import {
  ActionIcon,
  Box,
  Button,
  Group,
  Paper,
  ScrollArea,
  Select,
  Switch,
  Text,
} from "@mantine/core";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
  diffCountsAtom,
  highlightChangesAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import HistoryView from "@/features/page-history/components/history-view";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { IconCheck, IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { usePageHistoryListQuery } from "@/features/page-history/queries/page-history-query";
import { formattedDate } from "@/lib/time";
import {
  useDiffNavigation,
  useCurrentPageDraft,
  useHistoryReset,
  useHistoryRestore,
} from "@/features/page-history/hooks";
import classes from "./css/history-mobile.module.css";
import { getHistoryItemStatus } from "@/features/page-history/history-status";
import { CURRENT_DRAFT_HISTORY_ID } from "@/features/page-history/types/page.types";

interface Props {
  pageId: string;
  pageTitle?: string;
}

export default function HistoryModalMobile({ pageId, pageTitle }: Props) {
  const { t } = useTranslation();

  const [activeHistoryId, setActiveHistoryId] = useAtom(activeHistoryIdAtom);
  const setActiveHistoryPrevId = useSetAtom(activeHistoryPrevIdAtom);
  const [highlightChanges, setHighlightChanges] = useAtom(highlightChangesAtom);
  const diffCounts = useAtomValue(diffCountsAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);
  const { draft } = useCurrentPageDraft(pageId);

  const scrollViewportRef = useRef<HTMLDivElement>(null);
  const dropdownViewportRef = useRef<HTMLDivElement>(null);

  const {
    data: pageHistoryData,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = usePageHistoryListQuery(pageId);

  const savedHistoryItems = useMemo(() => {
    const items = pageHistoryData?.pages.flatMap((page) => page.items) ?? [];
    const mergedItems = [...items];

    return mergedItems.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [pageHistoryData]);

  const historyItems = useMemo(
    () => [draft, ...savedHistoryItems],
    [draft, savedHistoryItems],
  );

  const currentRevisionId =
    pageHistoryData?.pages[0]?.currentRevisionId ?? null;

  const selectData = useMemo(
    () =>
      historyItems.map((item) => {
        const contributors =
          item.kind === "draft" ? undefined : item.contributors;
        const hasContributors = contributors && contributors.length > 0;
        const names = hasContributors
          ? contributors.map((c) => c.name).join(", ")
          : item.kind === "draft"
            ? undefined
            : (item.lastUpdatedBy?.name ?? t("Deleted user"));
        const status = getHistoryItemStatus(
          item.id,
          { currentRevisionId },
          item.kind,
        );
        const labels = [
          status.isDraft ? t("Current") : null,
          status.isManual ? t("Saved version") : null,
          status.isAutomatic ? t("Automatic") : null,
        ].filter(Boolean);
        return {
          value: item.id,
          label: [
            item.kind === "draft"
              ? t("Current draft")
              : formattedDate(new Date(item.createdAt)),
            ...labels,
          ].join(" · "),
          userName: item.kind === "draft" ? t("Current draft") : names,
          description: item.kind === "draft" ? undefined : item.description,
        };
      }),
    [historyItems, currentRevisionId, t],
  );

  useHistoryReset(pageId);
  const { canRestore, confirmRestore, isRestoreDisabled, isRestoring } =
    useHistoryRestore();
  const { currentChangeIndex, handlePrevChange, handleNextChange } =
    useDiffNavigation(scrollViewportRef);

  useEffect(() => {
    if (isLoading) return;

    if (historyItems.length > 0 && !activeHistoryId) {
      setActiveHistoryId(historyItems[0].id);
      setActiveHistoryPrevId(historyItems[1]?.id ?? "");
    }
  }, [
    historyItems,
    isLoading,
    activeHistoryId,
    setActiveHistoryId,
    setActiveHistoryPrevId,
  ]);

  const handleDropdownScroll = useCallback(() => {
    const viewport = dropdownViewportRef.current;
    if (!viewport || !hasNextPage || isFetchingNextPage) return;

    const { scrollTop, scrollHeight, clientHeight } = viewport;
    const isNearBottom = scrollTop + clientHeight >= scrollHeight - 50;

    if (isNearBottom) {
      fetchNextPage();
    }
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  const handleSelectVersion = useCallback(
    (value: string | null) => {
      if (!value) return;
      const index = historyItems.findIndex((item) => item.id === value);
      if (index >= 0) {
        setActiveHistoryId(value);
        setActiveHistoryPrevId(historyItems[index + 1]?.id ?? "");
      }
    },
    [historyItems, setActiveHistoryId, setActiveHistoryPrevId],
  );

  if (isLoading) {
    return null;
  }

  return (
    <Box className={classes.container}>
      <Box className={classes.selectorWrapper}>
        <Select
          data={selectData}
          value={activeHistoryId}
          onChange={handleSelectVersion}
          placeholder={t("Select version")}
          checkIconPosition="right"
          maxDropdownHeight={300}
          renderOption={({ option, checked }) => (
            <Group justify="space-between" wrap="nowrap" w="100%">
              <div>
                <Text size="sm">{option.label}</Text>
                <Text size="xs" c="dimmed">
                  {(option as { userName?: string; description?: string })
                    .description ?? (option as { userName?: string }).userName}
                </Text>
              </div>
              {checked && <IconCheck size={16} />}
            </Group>
          )}
          comboboxProps={{ withinPortal: false }}
          scrollAreaProps={{
            viewportRef: dropdownViewportRef,
            onScrollPositionChange: handleDropdownScroll,
          }}
        />
      </Box>

      <Box className={classes.editorArea}>
        <ScrollArea h="100%" viewportRef={scrollViewportRef} scrollbarSize={5}>
          <Box className={classes.editorContent}>
            {activeHistoryId && <HistoryView pageId={pageId} />}
          </Box>
        </ScrollArea>

        {activeHistoryId && (
          <Paper
            shadow="sm"
            radius="xl"
            px="md"
            py="xs"
            className={classes.floatingBar}
          >
            <Group gap="sm" wrap="nowrap">
              <Switch
                label={t("Highlight changes")}
                checked={highlightChanges}
                onChange={(e) => setHighlightChanges(e.currentTarget.checked)}
                size="sm"
                styles={{ label: { userSelect: "none", whiteSpace: "nowrap" } }}
              />
              {highlightChanges && diffCounts && diffCounts.total > 0 && (
                <Group gap={4} wrap="nowrap">
                  <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                    {currentChangeIndex} of {diffCounts.total}
                  </Text>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handlePrevChange}
                  >
                    <IconChevronUp size={16} />
                  </ActionIcon>
                  <ActionIcon
                    variant="subtle"
                    size="sm"
                    onClick={handleNextChange}
                  >
                    <IconChevronDown size={16} />
                  </ActionIcon>
                </Group>
              )}
            </Group>
          </Paper>
        )}
      </Box>

      {canRestore && (
        <Group className={classes.actionButtons} justify="flex-end" gap="sm">
          <Button variant="default" onClick={() => setHistoryModalOpen(false)}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={confirmRestore}
            disabled={isRestoreDisabled}
            loading={isRestoring}
            aria-label={t(isRestoring ? "Restoring version" : "Restore")}
          >
            {t(isRestoring ? "Restoring version" : "Restore")}
          </Button>
        </Group>
      )}
    </Box>
  );
}
