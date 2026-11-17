export type TeamPermissionRole = "admin" | "member";

export type SpacePermissionSource =
  | "explicit"
  | "team-admin"
  | "workspace-admin"
  | "page-share";

export type ISpaceAccess = {
  userId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  source: SpacePermissionSource;
};

export type ISpacePermission = {
  userId: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  teamRole: TeamPermissionRole;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  source: SpacePermissionSource;
};

export type IUpdateSpacePermissions = {
  spaceId: string;
  permissions: Array<
    Pick<
      ISpacePermission,
      "userId" | "canView" | "canCreate" | "canEdit" | "canDelete"
    >
  >;
};

export type IUpdateSpaceMemberPermission = {
  spaceId: string;
  userId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
};
