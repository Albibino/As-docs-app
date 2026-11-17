import api from "@/lib/api-client";
import { IPagination, QueryParams } from "@/lib/types.ts";
import {
  IAddTeamMembers,
  ICreateTeam,
  IRemoveTeamMember,
  ITeam,
  ITeamMember,
  IUpdateTeam,
  IUpdateTeamMemberRole,
} from "@/features/team/types/team.types.ts";

export async function getTeams(
  params?: QueryParams,
): Promise<IPagination<ITeam>> {
  const response = await api.post<IPagination<ITeam>>("/teams", params);
  return response.data;
}

export async function getTeam(teamId: string): Promise<ITeam> {
  const response = await api.post<ITeam>("/teams/info", { teamId });
  return response.data;
}

export async function createTeam(data: ICreateTeam): Promise<ITeam> {
  const response = await api.post<ITeam>("/teams/create", data);
  return response.data;
}

export async function updateTeam(data: IUpdateTeam): Promise<ITeam> {
  const response = await api.post<ITeam>("/teams/update", data);
  return response.data;
}

export async function getTeamMembers(
  teamId: string,
  params?: QueryParams,
): Promise<IPagination<ITeamMember>> {
  const response = await api.post<IPagination<ITeamMember>>("/teams/members", {
    teamId,
    ...params,
  });
  return response.data;
}

export async function addTeamMembers(data: IAddTeamMembers): Promise<void> {
  await api.post("/teams/members/add", data);
}

export async function updateTeamMemberRole(
  data: IUpdateTeamMemberRole,
): Promise<void> {
  await api.post("/teams/members/role", data);
}

export async function removeTeamMember(
  data: IRemoveTeamMember,
): Promise<void> {
  await api.post("/teams/members/remove", data);
}
