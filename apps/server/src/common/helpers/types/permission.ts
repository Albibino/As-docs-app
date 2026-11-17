export enum UserRole {
  OWNER = 'owner',
  ADMIN = 'admin', // can have owner permissions but cannot delete workspace
  MEMBER = 'member',
}

export enum InviteUserRole {
  ADMIN = 'admin', // can have owner permissions but cannot delete workspace
  MEMBER = 'member',
}

export enum SpaceRole {
  ADMIN = 'admin', // can manage space settings, members, and delete space
  WRITER = 'writer', // can read and write pages in space
  READER = 'reader', // can only read pages in space
}

export enum TeamRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export type SpacePermission = {
  userId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  source: 'explicit' | 'team-admin' | 'workspace-admin' | 'page-share';
};

export enum SpaceVisibility {
  OPEN = 'open', // any workspace member can see that it exists and join.
  PRIVATE = 'private', // only added space users can see
}

export enum PageAccessLevel {
  RESTRICTED = 'restricted', // only specifically authorized users can view or edit
}

export enum PagePermissionRole {
  READER = 'reader', // can only view content and descendants
  WRITER = 'writer', // can edit content, descendants, and add new users to permission
}

export enum PagePermissionSubjectType {
  USER = 'user',
  TEAM = 'team',
  WORKSPACE = 'workspace',
}

export type PagePermissionFlags = {
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
};
