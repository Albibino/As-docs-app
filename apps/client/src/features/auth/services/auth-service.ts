import api from "@/lib/api-client";
import type { ApiResponse } from "@/lib/types";
import { ICollabToken } from "@/features/auth/types/auth.types";

/** Usuário fixo do TCC que pode ser escolhido na tela inicial. */
export interface ITccUser {
  key: string;
  id: string;
  name: string;
}

export async function getOidcStatus(signal: AbortSignal): Promise<boolean> {
  const response = await api.get<
    unknown,
    ApiResponse<{ enabled?: unknown } | null> | null
  >("/auth/oidc/status", {
    signal,
    timeout: 10000,
    headers: { "Cache-Control": "no-cache" },
  });
  const enabled = response?.data?.enabled;
  if (typeof enabled !== "boolean") {
    throw new Error("Invalid OIDC status response");
  }
  return enabled;
}

export async function listTccUsers(): Promise<ITccUser[]> {
  const { data } = await api.post<unknown, ApiResponse<ITccUser[]>>(
    "/auth/users",
  );
  return data;
}

/** Escolhe "Usuário 1" ou "Usuário 2"; o servidor grava o cookie de sessão. */
export async function selectTccUser(userKey: string): Promise<void> {
  await api.post<void>("/auth/select-user", { userKey });
}

export async function logout(): Promise<void> {
  await api.post<void>("/auth/logout");
}

export async function getCollabToken(): Promise<ICollabToken> {
  const req = await api.post<ICollabToken>("/auth/collab-token");
  return req.data;
}
