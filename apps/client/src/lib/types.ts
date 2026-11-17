export interface QueryParams {
  query?: string;
  cursor?: string;
  beforeCursor?: string;
  limit?: number;
  adminView?: boolean;
  teamId?: string;
  archived?: boolean;
}

export enum UserRole {
  OWNER = "owner",
  ADMIN = "admin",
  MEMBER = "member",
}

export enum SpaceRole {
  ADMIN = "admin",
  WRITER = "writer",
  READER = "reader",
}

export enum TeamRole {
  ADMIN = "admin",
  MEMBER = "member",
}

export type SpacePermission = {
  userId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  source: "explicit" | "team-admin" | "workspace-admin";
};

export interface IRoleData {
  label: string;
  value: string;
  description: string;
}

export interface ApiResponse<T> {
  data: T;
}

export type IPaginationMeta = {
  limit: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
};
export type IPagination<T> = {
  items: T[];
  meta: IPaginationMeta;
};
