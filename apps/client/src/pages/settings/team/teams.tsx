import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Badge, Group, Loader, Stack, Table, Text, Title } from "@mantine/core";
import SettingsTitle from "@/components/settings/settings-title";
import { getAppName } from "@/lib/config";
import { CustomAvatar } from "@/components/ui/custom-avatar";
import { SpaceAvatar } from "@/components/ui/space-avatar";
import NoTableResults from "@/components/common/no-table-results";
import {
  useTeamMembersQuery,
  useTeamsQuery,
} from "@/features/team/queries/team-query";
import type { ITeam } from "@/features/team/types/team.types";

/**
 * TCC: existe um único time, criado pelo servidor com "Usuário 1" e
 * "Usuário 2". Criar times e gerenciar membros foi removido; a tela só mostra
 * quem faz parte dele.
 */
export default function Teams() {
  const { t } = useTranslation();
  const query = useTeamsQuery({ limit: 10 });

  return (
    <>
      <Helmet>
        <title>
          {t("Teams")} - {getAppName()}
        </title>
      </Helmet>
      <SettingsTitle title={t("Teams")} />
      {query.isPending && <Loader size="sm" />}
      <Stack gap="xl">
        {query.data?.items.map((team) => (
          <TeamCard key={team.id} team={team} />
        ))}
      </Stack>
    </>
  );
}

function TeamCard({ team }: { team: ITeam }) {
  const { t } = useTranslation();
  const members = useTeamMembersQuery(team.id, { limit: 50 });

  return (
    <Stack gap="sm">
      <Group gap="sm">
        <SpaceAvatar color="initials" name={team.name} variant="filled" />
        <div>
          <Title order={4}>{team.name}</Title>
          <Text size="xs" c="dimmed">
            {team.description}
          </Text>
        </div>
      </Group>
      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Member")}</Table.Th>
            <Table.Th>{t("Role")}</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {members.data?.items.map((member) => (
            <Table.Tr key={member.userId}>
              <Table.Td>
                <Group gap="sm" wrap="nowrap">
                  <CustomAvatar avatarUrl={member.avatarUrl} name={member.name} />
                  <Text size="sm" fw={500}>
                    {member.name}
                  </Text>
                </Group>
              </Table.Td>
              <Table.Td>
                <Badge variant="light">
                  {t(member.role === "admin" ? "Admin" : "Member")}
                </Badge>
              </Table.Td>
            </Table.Tr>
          ))}
          {!members.isPending && !members.data?.items.length && (
            <NoTableResults colSpan={2} />
          )}
        </Table.Tbody>
      </Table>
    </Stack>
  );
}
