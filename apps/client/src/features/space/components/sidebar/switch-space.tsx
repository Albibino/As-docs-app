import classes from "./switch-space.module.css";
import { useNavigate } from "react-router-dom";
import { SpaceSelect } from "./space-select";
import { getSpaceUrl } from "@/lib/config";
import {
  Button,
  Popover,
  Select,
  Text,
  Tooltip,
  UnstyledButton,
} from "@mantine/core";
import { IconChevronDown, IconChevronUp } from "@tabler/icons-react";
import { useDisclosure } from "@mantine/hooks";
import { SpaceAvatar } from "@/components/ui/space-avatar.tsx";
import React from "react";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useTeamsQuery } from "@/features/team/queries/team-query.ts";

interface SwitchSpaceProps {
  spaceName: string;
  spaceSlug: string;
  spaceIcon?: string;
  teamId: string;
  collapsed?: boolean;
}

export function SwitchSpace({
  spaceName,
  spaceSlug,
  spaceIcon,
  teamId,
  collapsed = false,
}: SwitchSpaceProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, { close, toggle }] = useDisclosure(false);
  const [activeTeamId, setActiveTeamId] = useState(teamId);
  const { data: teams } = useTeamsQuery({ limit: 100 });

  useEffect(() => {
    setActiveTeamId(teamId);
  }, [teamId]);

  const handleSelect = (value: string) => {
    if (value) {
      navigate(getSpaceUrl(value));
      close();
    }
  };

  const avatar = (
    <SpaceAvatar
      name={spaceName}
      logo={spaceIcon}
      color="initials"
      variant="filled"
      size={20}
    />
  );

  return (
    <Popover
      width={300}
      position="bottom"
      withArrow
      shadow="md"
      opened={opened}
      onChange={toggle}
      trapFocus
      returnFocus
    >
      <Popover.Target>
        {collapsed ? (
          <Tooltip label={spaceName} position="right" withArrow>
            <UnstyledButton
              onClick={toggle}
              aria-label={spaceName}
              style={{ display: "flex", justifyContent: "center", width: "100%" }}
            >
              {avatar}
            </UnstyledButton>
          </Tooltip>
        ) : (
          <Button
            variant="subtle"
            fullWidth
            justify="space-between"
            rightSection={opened ? <IconChevronUp size={18} /> : <IconChevronDown size={18} />}
            color="gray"
            onClick={toggle}
          >
            {avatar}
            <Text className={classes.spaceName} size="md" fw={500} lineClamp={1}>
              {spaceName}
            </Text>
          </Button>
        )}
      </Popover.Target>
      <Popover.Dropdown>
        <Select
          label={t("Team")}
          placeholder={t("Select a team")}
          value={activeTeamId}
          onChange={(value) => value && setActiveTeamId(value)}
          data={
            teams?.items.map((team) => ({ value: team.id, label: team.name })) ??
            []
          }
          searchable
          mb="sm"
        />
        <SpaceSelect
          label={spaceName}
          value={spaceSlug}
          onChange={(space) => handleSelect(space.slug)}
          teamId={activeTeamId}
          width={300}
          opened={true}
        />
      </Popover.Dropdown>
    </Popover>
  );
}
