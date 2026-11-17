import { Button, Group, Popover, Select, Text, Tooltip, UnstyledButton } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import type { ITeam } from "@/features/team/types/team.types";
import classes from "./team-switcher.module.css";

type TeamSwitcherProps = {
  currentTeamId: string;
  pendingTeamId?: string;
  teams: ITeam[];
  collapsed?: boolean;
  onTeamChange: (teamId: string) => void;
};

export function TeamSwitcher({
  currentTeamId,
  pendingTeamId,
  teams,
  collapsed = false,
  onTeamChange,
}: TeamSwitcherProps) {
  const { t } = useTranslation();
  const [opened, { close, toggle }] = useDisclosure(false);
  const selectedTeam = teams.find((team) => team.id === (pendingTeamId ?? currentTeamId));
  const displayedTeam = selectedTeam ?? teams.find((team) => team.id === currentTeamId);
  const teamName = displayedTeam?.name ?? t("Team");

  const trigger = collapsed ? (
    <Tooltip label={teamName} position="right" withArrow>
      <UnstyledButton
        className={classes.collapsedButton}
        onClick={toggle}
        aria-label={t("Select a team")}
        aria-expanded={opened}
      >
        <CustomAvatar name={teamName} color="initials" variant="filled" size={20} />
      </UnstyledButton>
    </Tooltip>
  ) : (
    <Button
      variant="subtle"
      fullWidth
      justify="space-between"
      color="gray"
      onClick={toggle}
      aria-label={t("Select a team")}
      aria-expanded={opened}
      rightSection={opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
    >
      <Group gap="sm" wrap="nowrap">
        <CustomAvatar name={teamName} color="initials" variant="filled" size={20} />
        <Text className={classes.name} size="md" fw={500} lineClamp={1}>
          {teamName}
        </Text>
      </Group>
    </Button>
  );

  return (
    <Popover width={300} position="bottom" withArrow shadow="md" opened={opened} onChange={toggle} trapFocus returnFocus>
      <Popover.Target>{trigger}</Popover.Target>
      <Popover.Dropdown>
        <Select
          label={t("Select a team")}
          placeholder={t("Select a team")}
          value={pendingTeamId ?? currentTeamId}
          onChange={(teamId) => {
            if (teamId) onTeamChange(teamId);
            close();
          }}
          data={teams.map((team) => ({ value: team.id, label: team.name }))}
          searchable
          renderOption={({ option }) => (
            <Group gap="sm" wrap="nowrap">
              <CustomAvatar name={option.label} color="initials" variant="filled" size={20} />
              <Text size="sm" lineClamp={1}>{option.label}</Text>
            </Group>
          )}
        />
        {pendingTeamId && pendingTeamId !== currentTeamId && (
          <Text size="xs" c="dimmed" mt="sm" role="status">
            {t("Choose a space to continue")}
          </Text>
        )}
      </Popover.Dropdown>
    </Popover>
  );
}
