import { Container, Title, Text, Group, Box, Button } from "@mantine/core";
import { IconArrowLeft } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Helmet } from "react-helmet-async";
import { getAppName } from "@/lib/config";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { AllSpacesList } from "@/features/space/components/spaces-page";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useTeamQuery } from "@/features/team/queries/team-query";

export default function Spaces() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const teamId = searchParams.get("teamId") ?? undefined;
  const teamQuery = useTeamQuery(teamId);
  const { search, cursor, goNext, goPrev, handleSearch } =
    usePaginateAndSearch();

  const { data, isLoading } = useGetSpacesQuery({
    cursor,
    limit: 30,
    query: search,
    teamId,
  });

  if (!teamId) {
    return <Navigate to="/home" replace />;
  }

  return (
    <>
      <Helmet>
        <title>
          {teamQuery.data?.name ?? t("Spaces")} - {getAppName()}
        </title>
      </Helmet>

      <Container size={"800"} pt="xl">
        <Group justify="space-between" mb="xl">
          <div>
            <Button
              component={Link}
              to="/home"
              variant="subtle"
              size="xs"
              leftSection={<IconArrowLeft size={14} />}
              mb="xs"
            >
              {t("Teams")}
            </Button>
            <Title order={1} size="h3">
              {teamQuery.data?.name ?? t("Spaces")}
            </Title>
          </div>
        </Group>

        <Box>
          <Text size="sm" c="dimmed" mb="md">
            {t("Spaces in {{team}}", { team: teamQuery.data?.name ?? "" })}
          </Text>

          <AllSpacesList
            spaces={(data?.items ?? []).filter(
              (space) => space.teamId === teamId,
            )}
            onSearch={handleSearch}
            hasPrevPage={data?.meta?.hasPrevPage}
            hasNextPage={data?.meta?.hasNextPage}
            onNext={() => goNext(data?.meta?.nextCursor)}
            onPrev={goPrev}
            teamName={teamQuery.data?.name}
          />
        </Box>
      </Container>
    </>
  );
}
