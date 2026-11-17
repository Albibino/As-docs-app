import api from "@/lib/api-client";
import {
  ICreateSpace,
  IExportSpaceParams,
  ISpace,
} from "@/features/space/types/space.types";
import {
  ISpacePermission,
  IUpdateSpacePermissions,
  IUpdateSpaceMemberPermission,
} from "@/features/space/types/space-permission.types";
import { IUser } from "@/features/user/types/user.types.ts";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { saveAs } from "file-saver";

export async function getSpaces(
  params?: QueryParams,
): Promise<IPagination<ISpace>> {
  const req = await api.post("/spaces", params);
  return req.data;
}

export async function getSpaceById(spaceId: string): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/info", { spaceId });
  return req.data;
}

export async function createSpace(data: ICreateSpace): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/create", data);
  return req.data;
}

export async function updateSpace(data: Partial<ISpace>): Promise<ISpace> {
  const req = await api.post<ISpace>("/spaces/update", data);
  return req.data;
}

export async function archiveSpace(spaceId: string): Promise<void> {
  await api.post<void>("/spaces/archive", { spaceId });
}

export async function restoreSpace(spaceId: string): Promise<void> {
  await api.post<void>("/spaces/restore", { spaceId });
}

export async function getSpaceMembers(spaceId: string, params?: QueryParams) {
  const req = await api.post<any>("/spaces/members", { spaceId, ...params });
  return req.data;
}

export async function getSpaceAssignableUsers(
  spaceId: string,
  params?: QueryParams,
): Promise<IPagination<IUser>> {
  const req = await api.post<any>("/spaces/members/assignable", {
    spaceId,
    ...params,
  });
  return req.data;
}

export async function getSpacePermissions(
  spaceId: string,
  params?: QueryParams,
): Promise<IPagination<ISpacePermission>> {
  const req = await api.post<IPagination<ISpacePermission>>(
    "/spaces/permissions",
    { spaceId, ...params },
  );
  return req.data;
}

export async function updateSpacePermissions(
  data: IUpdateSpacePermissions,
): Promise<void> {
  await api.post("/spaces/permissions/update", data);
}

export async function updateSpaceMemberPermission(
  data: IUpdateSpaceMemberPermission,
): Promise<void> {
  await api.post("/spaces/permissions/member/update", data);
}

export async function exportSpace(data: IExportSpaceParams): Promise<void> {
  const req = await api.post("/spaces/export", data, {
    responseType: "blob",
  });

  const fileName = req?.headers["content-disposition"]
    .split("filename=")[1]
    .replace(/"/g, "");

  let decodedFileName = fileName;
  try {
    decodedFileName = decodeURIComponent(fileName);
  } catch (err) {
    // fallback to raw filename
  }

  saveAs(req.data, decodedFileName);
}
