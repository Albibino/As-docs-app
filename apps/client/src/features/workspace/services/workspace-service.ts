import api from "@/lib/api-client";
import { IUser } from "@/features/user/types/user.types";
import {
  ICreateInvite,
  ICreateInvitationResult,
  IInvitation,
  IWorkspace,
  IAcceptInvite,
  IPublicWorkspace,
  IInvitationLink,
  IPublicInvitation,
  IOwnInvitation,
  IVersion,
  IPdfExportThemeSettings,
} from "../types/workspace.types";
import { IPagination, QueryParams } from "@/lib/types.ts";
import { ISetupWorkspace } from "@/features/auth/types/auth.types.ts";

export async function getWorkspace(): Promise<IWorkspace> {
  const req = await api.post<IWorkspace>("/workspace/info");
  return req.data;
}

export async function getWorkspacePublicData(): Promise<IPublicWorkspace> {
  const req = await api.post<IPublicWorkspace>("/workspace/public");
  return req.data;
}

export async function getWorkspaceMembers(
  params?: QueryParams,
): Promise<IPagination<IUser>> {
  const req = await api.post("/workspace/members", params);
  return req.data;
}

export async function deleteWorkspaceMember(data: {
  userId: string;
}): Promise<void> {
  await api.post("/workspace/members/delete", data);
}

export async function deactivateWorkspaceMember(data: {
  userId: string;
}): Promise<void> {
  await api.post("/workspace/members/deactivate", data);
}

export async function activateWorkspaceMember(data: {
  userId: string;
}): Promise<void> {
  await api.post("/workspace/members/activate", data);
}

export async function updateWorkspace(
  data: Partial<IWorkspace> & { pdfExport?: IPdfExportThemeSettings },
) {
  const req = await api.post<IWorkspace>("/workspace/update", data);
  return req.data;
}

export async function uploadPdfExportAsset(
  file: File,
): Promise<{ assetId: string }> {
  const formData = new FormData();
  formData.append("image", file);
  const req = await api.post<{ assetId: string }>(
    "/workspace/pdf-export-assets",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
    },
  );
  return req.data;
}

export async function deletePdfExportAsset(assetId: string): Promise<void> {
  await api.post("/workspace/pdf-export-assets/delete", { assetId });
}

export async function changeMemberRole(data: {
  userId: string;
  role: string;
}): Promise<void> {
  await api.post("/workspace/members/change-role", data);
}

export async function getPendingInvitations(
  params?: QueryParams,
): Promise<IPagination<IInvitation>> {
  const req = await api.post("/workspace/invites", params);
  return req.data;
}

export async function createInvitation(
  data: ICreateInvite,
): Promise<ICreateInvitationResult> {
  const req = await api.post<ICreateInvitationResult>(
    "/workspace/invites/create",
    data,
  );
  return req.data;
}

export async function acceptInvitation(
  data: IAcceptInvite,
): Promise<{ requiresLogin?: boolean }> {
  const req = await api.post("/workspace/invites/accept", data);
  return req.data;
}

/**
 * The three calls below work from a denied state, where the user has a valid
 * session but no workspace membership yet. They are the only workspace calls
 * that do, which is why they live behind their own `mine` routes.
 */
export async function getMyInvitations(): Promise<IOwnInvitation[]> {
  const req = await api.post("/workspace/invites/mine");
  return req.data;
}

export async function acceptMyInvitation(data: {
  invitationId: string;
}): Promise<{ requiresLogin?: boolean }> {
  const req = await api.post("/workspace/invites/mine/accept", data);
  return req.data;
}

export async function declineMyInvitation(data: {
  invitationId: string;
}): Promise<void> {
  await api.post("/workspace/invites/mine/decline", data);
}

export async function getInviteLink(data: {
  invitationId: string;
}): Promise<IInvitationLink> {
  const req = await api.post("/workspace/invites/link", data);
  return req.data;
}

export async function resendInvitation(data: {
  invitationId: string;
}): Promise<void> {
  await api.post("/workspace/invites/resend", data);
}

export async function revokeInvitation(data: {
  invitationId: string;
}): Promise<void> {
  await api.post("/workspace/invites/revoke", data);
}

export async function getInvitationById(data: {
  invitationId: string;
  token: string;
}): Promise<IPublicInvitation> {
  const req = await api.post("/workspace/invites/info", data);
  return req.data;
}

export async function createWorkspace(
  data: ISetupWorkspace,
): Promise<{
  workspace: IWorkspace;
  exchangeToken?: string;
  requiresEmailVerification?: boolean;
  emailSignature?: string;
}> {
  const req = await api.post("/workspace/create", data);
  return req.data;
}

export async function getAppVersion(): Promise<IVersion> {
  const req = await api.post("/version");
  return req.data;
}
