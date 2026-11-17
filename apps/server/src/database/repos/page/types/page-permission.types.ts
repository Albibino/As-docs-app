export type PagePermissionMember = {
  id: string;
  name: string;
  type: 'user' | 'team' | 'workspace';
  email?: string;
  avatarUrl?: string | null;
  canView: boolean;
  canEdit: boolean;
  canDelete: boolean;
  includeSubpages: boolean;
  createdAt: Date;
};
