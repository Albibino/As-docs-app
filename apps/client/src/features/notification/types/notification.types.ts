export type NotificationType =
  | "comment.user_mention"
  | "comment.created"
  | "comment.resolved"
  | "page.user_mention"
  | "page.permission_granted"
  | "page.permission_revoked"
  | "page.updated"
  | "page.verification_expiring"
  | "page.verification_expired"
  | "page.verified"
  | "page.approval_requested"
  | "page.approval_rejected"
  | "team.member_added"
  | "team.member_removed"
  | "team.member_role_changed"
  | "space.access_granted"
  | "space.access_revoked"
  | "space.access_changed";

export type INotification = {
  id: string;
  userId: string;
  workspaceId: string;
  type: NotificationType;
  actorId: string | null;
  pageId: string | null;
  spaceId: string | null;
  commentId: string | null;
  data: Record<string, unknown> | null;
  readAt: string | null;
  emailedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  actor: {
    id: string;
    name: string;
    avatarUrl: string | null;
  } | null;
  page: {
    id: string;
    title: string;
    slugId: string;
    icon: string | null;
  } | null;
  space: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type NotificationFilter = "all" | "unread";

export type NotificationTab = "direct" | "updates" | "all";
