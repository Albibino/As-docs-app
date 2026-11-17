import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  UseQueryResult,
} from "@tanstack/react-query";
import { notifications } from "@mantine/notifications";
import { useTranslation } from "react-i18next";
import { IPagination, QueryParams } from "@/lib/types.ts";
import {
  addTeamMembers,
  createTeam,
  getTeam,
  getTeamMembers,
  getTeams,
  removeTeamMember,
  updateTeam,
  updateTeamMemberRole,
} from "@/features/team/services/team-service.ts";
import {
  IAddTeamMembers,
  ICreateTeam,
  IRemoveTeamMember,
  ITeam,
  ITeamMember,
  IUpdateTeam,
  IUpdateTeamMemberRole,
} from "@/features/team/types/team.types.ts";

export function useTeamsQuery(
  params?: QueryParams,
  enabled = true,
): UseQueryResult<IPagination<ITeam>, Error> {
  return useQuery({
    queryKey: ["teams", params],
    queryFn: () => getTeams(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useTeamQuery(
  teamId: string | undefined,
): UseQueryResult<ITeam, Error> {
  return useQuery({
    queryKey: ["team", teamId],
    queryFn: () => getTeam(teamId!),
    enabled: !!teamId,
  });
}

export function useTeamMembersQuery(
  teamId: string | undefined,
  params?: QueryParams,
): UseQueryResult<IPagination<ITeamMember>, Error> {
  return useQuery({
    queryKey: ["teamMembers", teamId, params],
    queryFn: () => getTeamMembers(teamId!, params),
    placeholderData: keepPreviousData,
    enabled: !!teamId,
  });
}

function useTeamMutationFeedback() {
  const { t } = useTranslation();
  return {
    onError: () =>
      notifications.show({
        message: t("Unable to update the team"),
        color: "red",
      }),
  };
}

export function useCreateTeamMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const feedback = useTeamMutationFeedback();

  return useMutation<ITeam, Error, ICreateTeam>({
    mutationFn: createTeam,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      notifications.show({ message: t("Team created successfully") });
    },
    ...feedback,
  });
}

export function useUpdateTeamMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const feedback = useTeamMutationFeedback();

  return useMutation<ITeam, Error, IUpdateTeam>({
    mutationFn: updateTeam,
    onSuccess: (team) => {
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.setQueryData(["team", team.id], team);
      notifications.show({ message: t("Team updated successfully") });
    },
    ...feedback,
  });
}

export function useAddTeamMembersMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const feedback = useTeamMutationFeedback();

  return useMutation<void, Error, IAddTeamMembers>({
    mutationFn: addTeamMembers,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teamMembers", variables.teamId],
      });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["spacePermissions"] });
      notifications.show({ message: t("Team member added successfully") });
    },
    ...feedback,
  });
}

export function useUpdateTeamMemberRoleMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const feedback = useTeamMutationFeedback();

  return useMutation<void, Error, IUpdateTeamMemberRole>({
    mutationFn: updateTeamMemberRole,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teamMembers", variables.teamId],
      });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["spacePermissions"] });
      notifications.show({ message: t("Team member role updated") });
    },
    ...feedback,
  });
}

export function useRemoveTeamMemberMutation() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const feedback = useTeamMutationFeedback();

  return useMutation<void, Error, IRemoveTeamMember>({
    mutationFn: removeTeamMember,
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teamMembers", variables.teamId],
      });
      queryClient.invalidateQueries({ queryKey: ["teams"] });
      queryClient.invalidateQueries({ queryKey: ["spaces"] });
      queryClient.invalidateQueries({ queryKey: ["spacePermissions"] });
      notifications.show({ message: t("Team member removed successfully") });
    },
    ...feedback,
  });
}
