import { Button, Group, Popover, Select, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { EmptyState } from "@/components/ui/empty-state";
import { SpaceAvatar } from "@/components/ui/space-avatar";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import type { ISpace } from "@/features/space/types/space.types";
import { getSpaceUrl } from "@/lib/config";
import { IconLayoutGrid } from "@tabler/icons-react";
import classes from "./space-switcher.module.css";

type SpaceSwitcherProps = {
  currentSpace: ISpace;
  teamId: string;
  pendingTeamId?: string;
  collapsed?: boolean;
  fullWidth?: boolean;
  opened?: boolean;
  onOpenedChange?: (opened: boolean) => void;
  onSpaceChange?: (space: ISpace) => void;
  onCancelPendingChange?: () => void;
};

export function SpaceSwitcher({
  currentSpace,
  teamId,
  pendingTeamId,
  collapsed = false,
  fullWidth = true,
  opened: controlledOpened,
  onOpenedChange,
  onSpaceChange,
  onCancelPendingChange,
}: SpaceSwitcherProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [uncontrolledOpened, { close: closeUncontrolled, open: openUncontrolled }] = useDisclosure(false);
  const opened = controlledOpened ?? uncontrolledOpened;

  const setOpened = (nextOpened: boolean) => {
    if (controlledOpened === undefined) {
      if (nextOpened) openUncontrolled();
      else closeUncontrolled();
    }
    onOpenedChange?.(nextOpened);
  };

  const toggleOpened = () => setOpened(!opened);

  const selectedTeamId = pendingTeamId ?? teamId;
  const spacesQuery = useGetSpacesQuery({ teamId: selectedTeamId, limit: 50 });
  const isLoadingCurrentTeam = spacesQuery.isPending || spacesQuery.isPlaceholderData;
  const spaces = useMemo(
    () => (spacesQuery.data?.items ?? []).filter(
      (space) => !space.archivedAt && space.teamId === selectedTeamId,
    ),
    [selectedTeamId, spacesQuery.data],
  );
  const data = useMemo(
    () => spaces.map((space) => ({ value: space.slug, label: space.name, icon: space.logo })),
    [spaces],
  );

  const selectSpace = (slug: string | null) => {
    const nextSpace = spaces.find((space) => space.slug === slug);
    if (!nextSpace) return;
    navigate(getSpaceUrl(nextSpace.slug));
    setOpened(false);
    onSpaceChange?.(nextSpace);
  };

  const closeDropdown = () => {
    setOpened(false);
    if (pendingTeamId && pendingTeamId !== teamId) onCancelPendingChange?.();
  };

  const trigger = collapsed ? (
    <Tooltip label={currentSpace.name} position="right" withArrow>
      <UnstyledButton className={classes.collapsedButton} onClick={toggleOpened} aria-label={t("Select a space")} aria-expanded={opened}>
        <SpaceAvatar name={currentSpace.name} logo={currentSpace.logo} color="initials" variant="filled" size={20} />
      </UnstyledButton>
    </Tooltip>
  ) : (
    <Button
      variant="subtle"
      fullWidth={fullWidth}
      justify="space-between"
      color="gray"
      onClick={toggleOpened}
      aria-label={t("Select a space")}
      aria-expanded={opened}
      leftSection={<SpaceAvatar name={currentSpace.name} logo={currentSpace.logo} color="initials" variant="filled" size={20} />}
      rightSection={opened ? <IconChevronUp size={16} /> : <IconChevronDown size={16} />}
    >
      <Text className={classes.name} size="xs" fw={600} tt="uppercase" lineClamp={1}>{currentSpace.name}</Text>
    </Button>
  );

  return (
    <Popover width={300} position="bottom" withArrow shadow="md" opened={opened} onChange={(nextOpened) => nextOpened ? setOpened(true) : closeDropdown()} trapFocus returnFocus>
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown>
        {isLoadingCurrentTeam ? (
          <Text size="sm" c="dimmed">{t("Loading")}</Text>
        ) : spacesQuery.isError ? (
          <Text size="sm" c="red" role="alert">{t("Unable to load spaces")}</Text>
        ) : spaces.length === 0 ? (
          <EmptyState
            icon={IconLayoutGrid}
            title={t("No spaces in this team")}
            action={pendingTeamId ? <Button variant="subtle" onClick={closeDropdown}>{t("Cancel")}</Button> : undefined}
          />
        ) : (
          <Select
            label={t("Select a space")}
            placeholder={t("Select a space")}
            value={pendingTeamId ? null : currentSpace.slug}
            data={data}
            searchable
            onChange={selectSpace}
            onClick={(event) => event.stopPropagation()}
            comboboxProps={{ withinPortal: false }}
            renderOption={({ option }) => (
              <Group gap="sm" wrap="nowrap">
                <SpaceAvatar name={option.label} logo={option["icon"]} color="initials" variant="filled" size={20} />
                <Text size="sm" lineClamp={1}>{option.label}</Text>
              </Group>
            )}
          />
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
