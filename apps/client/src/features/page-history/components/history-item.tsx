import {
  Text,
  Group,
  UnstyledButton,
  Avatar,
  Tooltip,
  Badge,
} from "@mantine/core";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { formattedDate } from "@/lib/time";
import classes from "./css/history.module.css";
import clsx from "clsx";
import {
  IPageHistoryItem,
  isCurrentPageDraft,
} from "@/features/page-history/types/page.types";
import { memo, useCallback } from "react";

const MAX_VISIBLE_AVATARS = 5;

interface HistoryItemProps {
  historyItem: IPageHistoryItem;
  index: number;
  onSelect: (id: string, index: number) => void;
  onHover?: (id: string, index: number) => void;
  onHoverEnd?: () => void;
  isActive: boolean;
  isDraft?: boolean;
  isManual?: boolean;
  isAutomatic?: boolean;
  /** Revision currently served to anonymous viewers. */
}

const HistoryItem = memo(function HistoryItem({
  historyItem,
  index,
  onSelect,
  onHover,
  onHoverEnd,
  isActive,
  isDraft,
  isManual,
  isAutomatic,
}: HistoryItemProps) {
  const { t } = useTranslation();
  const handleClick = useCallback(() => {
    onSelect(historyItem.id, index);
  }, [onSelect, historyItem.id, index]);

  const handleMouseEnter = useCallback(() => {
    onHover?.(historyItem.id, index);
  }, [onHover, historyItem.id, index]);

  const contributors = isCurrentPageDraft(historyItem)
    ? undefined
    : historyItem.contributors;
  const hasContributors = contributors && contributors.length > 0;
  const isDraftItem = isCurrentPageDraft(historyItem);
  const lastUpdatedBy = isDraftItem ? undefined : historyItem.lastUpdatedBy;
  const lastUpdatedByName = lastUpdatedBy?.name ?? t("Deleted user");

  return (
    <UnstyledButton
      p="xs"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={onHoverEnd}
      className={clsx(classes.history, { [classes.active]: isActive })}
    >
      <Group gap={6} wrap="nowrap" justify="space-between">
        <Text size="sm">
          {isDraftItem
            ? t("Current draft")
            : formattedDate(new Date(historyItem.createdAt))}
        </Text>
        <Group gap={4} wrap="nowrap">
          {isDraft && (
            <Badge size="xs" variant="light" color="gray">
              {t("Current")}
            </Badge>
          )}
          {isManual && (
            <Badge size="xs" variant="light" color="blue">
              {t("Saved version")}
            </Badge>
          )}
          {isAutomatic && (
            <Badge size="xs" variant="light" color="gray">
              {t("Automatic")}
            </Badge>
          )}
        </Group>
      </Group>

      {!isDraftItem && (
        <Group gap={6} wrap="nowrap" mt={4}>
          {hasContributors ? (
            <>
              <Tooltip.Group openDelay={300} closeDelay={100}>
                <Avatar.Group spacing={8}>
                  {contributors
                    .slice(0, MAX_VISIBLE_AVATARS)
                    .map((contributor) => (
                      <Tooltip
                        key={contributor.id}
                        label={contributor.name}
                        withArrow
                      >
                        <CustomAvatar
                          size="sm"
                          avatarUrl={contributor.avatarUrl}
                          name={contributor.name}
                        />
                      </Tooltip>
                    ))}
                  {contributors.length > MAX_VISIBLE_AVATARS && (
                    <Tooltip
                      withArrow
                      label={contributors
                        .slice(MAX_VISIBLE_AVATARS)
                        .map((c) => (
                          <div key={c.id}>{c.name}</div>
                        ))}
                    >
                      <Avatar size="sm" color="gray">
                        +{contributors.length - MAX_VISIBLE_AVATARS}
                      </Avatar>
                    </Tooltip>
                  )}
                </Avatar.Group>
              </Tooltip.Group>
              {contributors.length === 1 && (
                <Text size="sm" c="dimmed" lineClamp={1}>
                  {contributors[0].name}
                </Text>
              )}
            </>
          ) : (
            <>
              <CustomAvatar
                size="sm"
                avatarUrl={lastUpdatedBy?.avatarUrl}
                name={lastUpdatedByName}
              />
              <Text size="sm" c="dimmed" lineClamp={1}>
                {lastUpdatedByName}
              </Text>
            </>
          )}
        </Group>
      )}
      {!isDraftItem && historyItem.description && (
        <Text size="xs" c="dimmed" lineClamp={2} mt={4}>
          {historyItem.description}
        </Text>
      )}
    </UnstyledButton>
  );
});

export default HistoryItem;
