export const NotificationType = {
  COMMENT_USER_MENTION: 'comment.user_mention',
  COMMENT_CREATED: 'comment.created',
  COMMENT_RESOLVED: 'comment.resolved',
  PAGE_USER_MENTION: 'page.user_mention',
  PAGE_PERMISSION_GRANTED: 'page.permission_granted',
  PAGE_PERMISSION_REVOKED: 'page.permission_revoked',
  PAGE_UPDATED: 'page.updated',
  PAGE_VERIFICATION_EXPIRING: 'page.verification_expiring',
  PAGE_VERIFICATION_EXPIRED: 'page.verification_expired',
  PAGE_VERIFIED: 'page.verified',
  PAGE_APPROVAL_REQUESTED: 'page.approval_requested',
  PAGE_APPROVAL_REJECTED: 'page.approval_rejected',
  TEAM_MEMBER_ADDED: 'team.member_added',
  TEAM_MEMBER_REMOVED: 'team.member_removed',
  TEAM_MEMBER_ROLE_CHANGED: 'team.member_role_changed',
  SPACE_ACCESS_GRANTED: 'space.access_granted',
  SPACE_ACCESS_REVOKED: 'space.access_revoked',
  SPACE_ACCESS_CHANGED: 'space.access_changed',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];

export type NotificationSettingKey =
  | 'page.updated'
  | 'page.userMention'
  | 'comment.userMention'
  | 'comment.created'
  | 'comment.resolved';

export const NotificationTypeToSettingKey: Partial<
  Record<NotificationType, NotificationSettingKey>
> = {
  [NotificationType.PAGE_UPDATED]: 'page.updated',
  [NotificationType.PAGE_USER_MENTION]: 'page.userMention',
  [NotificationType.COMMENT_USER_MENTION]: 'comment.userMention',
  [NotificationType.COMMENT_CREATED]: 'comment.created',
  [NotificationType.COMMENT_RESOLVED]: 'comment.resolved',
};

export type NotificationTab = 'direct' | 'updates' | 'all';

export const DIRECT_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.COMMENT_USER_MENTION,
  NotificationType.COMMENT_CREATED,
  NotificationType.COMMENT_RESOLVED,
  NotificationType.PAGE_USER_MENTION,
  NotificationType.PAGE_PERMISSION_GRANTED,
  NotificationType.PAGE_PERMISSION_REVOKED,
  NotificationType.TEAM_MEMBER_ADDED,
  NotificationType.TEAM_MEMBER_REMOVED,
  NotificationType.TEAM_MEMBER_ROLE_CHANGED,
  NotificationType.SPACE_ACCESS_GRANTED,
  NotificationType.SPACE_ACCESS_REVOKED,
  NotificationType.SPACE_ACCESS_CHANGED,
];

export const UPDATES_NOTIFICATION_TYPES: NotificationType[] = [
  NotificationType.PAGE_UPDATED,
];

export function getTypesForTab(
  tab: NotificationTab,
): NotificationType[] | undefined {
  if (tab === 'direct') return DIRECT_NOTIFICATION_TYPES;
  if (tab === 'updates') return UPDATES_NOTIFICATION_TYPES;
  return undefined;
}
