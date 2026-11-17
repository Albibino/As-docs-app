export interface IWorkspace {
  id: string;
  name: string;
  description: string;
  logo: string;
  hostname: string;
  customDomain: string;
  enableInvite: boolean;
  settings: IWorkspaceSettings;
  status: string;
  enforceSso: boolean;
  createdAt: Date;
  updatedAt: Date;
  emailDomains: string[];
  memberCount?: number;
  generativeAi?: boolean;
  disablePublicSharing?: boolean;
  trashRetentionDays?: number;
  restrictApiToAdmins?: boolean;
  defaultPageEditMode?: string;
}

export interface IWorkspaceSettings {
  ai?: IWorkspaceAiSettings;
  sharing?: IWorkspaceSharingSettings;
  api?: IWorkspaceApiSettings;
  defaultPageEditMode?: string;
  pdfExport?: IPdfExportThemeSettings;
}

export interface IPdfExportThemeSettings {
  page: {
    size: "A4";
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    fontFamily:
      | "Arial"
      | "Calibri"
      | "Georgia"
      | "Helvetica"
      | "Times New Roman"
      | "Verdana";
    fontSize: number;
    lineHeight: number;
    backgroundAsset: string | null;
    backgroundAssetId: string | null;
    backgroundAssetName?: string | null;
  };
  colors: {
    primary: string;
    secondary: string;
    text: string;
    coverBackground: string;
    coverText: string;
    tableHeaderBackground: string;
    tableHeaderText: string;
  };
  title: {
    fontSize: number;
    uppercase: boolean;
    color: string;
    alignment: "left" | "center" | "right";
  };
  headings: {
    fontSize: number;
    uppercase: boolean;
    color: string;
  };
  cover: {
    enabled: boolean;
    backgroundAsset: string | null;
    backgroundAssetId: string | null;
    backgroundAssetName?: string | null;
  };
  footer: {
    showPageNumber: boolean;
  };
}

export interface IWorkspaceSharingSettings {
  disabled?: boolean;
}

export interface IWorkspaceApiSettings {
  restrictToAdmins?: boolean;
}

export interface IWorkspaceAiSettings {
  generative?: boolean;
  chat?: boolean;
}

export interface ICreateInvite {
  role: string;
  emails: string[];
}

export interface ICreateInvitationResult {
  created: Array<{ email: string; invitationId: string }>;
  skipped: Array<{ email: string; reason: "active_member" }>;
  rejected: Array<{ email: string; reason: "deleted_member" }>;
}

export interface IInvitation {
  id: string;
  role: string;
  email: string;
  workspaceId: string;
  invitedById: string;
  createdAt: Date;
  expiresAt: Date;
  status: "pending";
}

export interface IPublicInvitation {
  id: string;
  email: string;
  status: "pending" | "accepted";
}

export interface IInvitationLink {
  inviteLink: string;
}

export interface IAcceptInvite {
  invitationId: string;
  token: string;
}

/**
 * An invitation as seen by its recipient rather than by a workspace admin.
 * Deliberately carries no token: the server authorizes acceptance by matching
 * the signed-in account's verified email addresses.
 */
export interface IOwnInvitation {
  id: string;
  email: string;
  role: string;
  createdAt: Date;
  workspaceName: string;
  invitedByName: string | null;
}

export interface IPublicWorkspace {
  id: string;
  name: string;
  logo: string;
  hostname: string;
  enforceSso: boolean;
}

export interface IVersion {
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
}
