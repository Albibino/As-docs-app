export enum QueueName {
  EMAIL_QUEUE = '{email-queue}',
  ATTACHMENT_QUEUE = '{attachment-queue}',
  GENERAL_QUEUE = '{general-queue}',
  FILE_TASK_QUEUE = '{file-task-queue}',
  AI_QUEUE = '{ai-queue}',
  HISTORY_QUEUE = '{history-queue}',
  NOTIFICATION_QUEUE = '{notification-queue}',
}

export enum QueueJob {
  SEND_EMAIL = 'send-email',
  DELETE_SPACE_ATTACHMENTS = 'delete-space-attachments',
  DELETE_PAGE_ATTACHMENTS = 'delete-page-attachments',
  DELETE_AI_CHAT_ATTACHMENTS = 'delete-ai-chat-attachments',

  DELETE_USER_AVATARS = 'delete-user-avatars',

  PAGE_BACKLINKS = 'page-backlinks',
  ADD_PAGE_WATCHERS = 'add-page-watchers',

  IMPORT_TASK = 'import-task',
  FOLDER_IMPORT_TASK = 'folder-import-task',
  EXPORT_TASK = 'export-task',

  PAGE_CREATED = 'page-created',
  PAGE_CONTENT_UPDATED = 'page-content-updated',
  PAGE_MOVED_TO_SPACE = 'page-moved-to-space',
  PAGE_UPDATED = 'page-updated',
  PAGE_SOFT_DELETED = 'page-soft-deleted',
  PAGE_RESTORED = 'page-restored',
  PAGE_DELETED = 'page-deleted',

  SPACE_CREATED = 'space-created',
  SPACE_UPDATED = 'space-updated',
  SPACE_DELETED = 'space-deleted',

  WORKSPACE_CREATED = 'workspace-created',
  WORKSPACE_SPACE_UPDATED = 'workspace-updated',
  WORKSPACE_DELETED = 'workspace-deleted',
  WORKSPACE_CREATE_EMBEDDINGS = 'workspace-create-embeddings',
  WORKSPACE_DELETE_EMBEDDINGS = 'workspace-delete-embeddings',

  GENERATE_PAGE_EMBEDDINGS = 'generate-page-embeddings',
  DELETE_PAGE_EMBEDDINGS = 'delete-page-embeddings',

  PAGE_HISTORY = 'page-history',

  COMMENT_NOTIFICATION = 'comment-notification',
  COMMENT_RESOLVED_NOTIFICATION = 'comment-resolved-notification',
  PAGE_MENTION_NOTIFICATION = 'page-mention-notification',
  PAGE_UPDATE_DIGEST = 'page-update-digest',
  PAGE_VERIFICATION_EXPIRING = 'page-verification-expiring',
  PAGE_VERIFICATION_EXPIRED = 'page-verification-expired',
  PAGE_VERIFIED_NOTIFICATION = 'page-verified-notification',
  PAGE_APPROVAL_REQUESTED_NOTIFICATION = 'page-approval-requested-notification',
  PAGE_APPROVAL_REJECTED_NOTIFICATION = 'page-approval-rejected-notification',
}
