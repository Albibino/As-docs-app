import api from "@/lib/api-client";
import { ICollabToken } from "@/features/auth/types/auth.types";

/** Usuário fixo do TCC que pode ser escolhido na tela inicial. */
export interface ITccUser {
  key: string;
  id: string;
  name: string;
}

export async function listTccUsers(): Promise<ITccUser[]> {
  const req = await api.post<ITccUser[]>("/auth/users");
  return req.data;
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
