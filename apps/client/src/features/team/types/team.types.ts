export type TeamRole = "admin" | "member";

export interface ITeam {
  id: string;
  workspaceId: string;
  name: string;
  description?: string | null;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  membersCount: number;
  spacesCount: number;
  isAdmin: boolean;
  isMember?: boolean;
}

export interface ITeamMember {
  membershipId: string;
  userId: string;
  role: TeamRole;
  createdAt: Date;
  name: string;
  email: string;
  avatarUrl?: string | null;
  deactivatedAt?: Date | null;
}

export interface ICreateTeam {
  name: string;
  description?: string;
}

export interface IUpdateTeam extends Partial<ICreateTeam> {
  teamId: string;
}

export interface IAddTeamMembers {
  teamId: string;
  userIds: string[];
  role?: TeamRole;
  permissions?: ITeamMemberSpacePermission[];
}

export interface ITeamMemberSpacePermission {
  userId: string;
  spaceId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface IUpdateTeamMemberRole {
  teamId: string;
  userId: string;
  role: TeamRole;
}

export interface IRemoveTeamMember {
  teamId: string;
  userId: string;
}
