import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type.ts";
import { ExportFormat } from "@/features/page/types/page.types.ts";
import {
  ISpaceAccess,
  ISpacePermission,
} from "./space-permission.types.ts";

export interface ISpaceSharingSettings {
  disabled?: boolean;
}

export interface ISpaceCommentsSettings {
  allowViewerComments?: boolean;
}

export interface ISpaceSettings {
  sharing?: ISpaceSharingSettings;
  comments?: ISpaceCommentsSettings;
}

export interface ISpace {
  id: string;
  name: string;
  description: string;
  logo?: string;
  slug: string;
  teamId: string;
  isPersonal?: boolean;
  hostname: string;
  creatorId: string;
  createdAt: Date;
  updatedAt: Date;
  archivedAt?: Date | null;
  archivedById?: string | null;
  memberCount?: number;
  spaceId?: string;
  permission?: ISpaceAccess;
  settings?: ISpaceSettings;
  disablePublicSharing?: boolean;
  // for updates
  allowViewerComments?: boolean;
}

export type ICreateSpace = Pick<
  ISpace,
  "name" | "slug" | "description" | "teamId"
> & {
  permissions?: Array<
    Pick<
      ISpacePermission,
      "userId" | "canView" | "canCreate" | "canEdit" | "canDelete"
    >
  >;
};

interface Permission {
  action: SpaceCaslAction;
  subject: SpaceCaslSubject;
}

type Permissions = Permission[];

export interface SpaceUserInfo {
  id: string;
  name: string;
  email: string;
  avatarUrl: string;
  type: "user";
}

export interface IExportSpaceParams {
  spaceId: string;
  format: ExportFormat;
  includeAttachments?: boolean;
}
