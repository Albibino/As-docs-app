import { Insertable, Selectable, Updateable } from 'kysely';
import {
  AiChats,
  AiChatMessages,
  Attachments,
  BaseProperties,
  BaseRows,
  BaseViews,
  Comments,
  LabelTrees,
  LabelNodeClosures,
  Labels,
  Notifications,
  PageLabels,
  PagePropertyDefinitions,
  PagePropertyValues,
  PageAccess as _PageAccess,
  PageTransclusions,
  PageTransclusionReferences,
  PagePermissions as _PagePermissions,
  PageVerifications as _PageVerifications,
  PageVerifiers as _PageVerifiers,
  Pages,
  Spaces,
  Users,
  Workspaces,
  PageHistory as History,
  SpacePermissions,
  UserTokens,
  Backlinks,
  AuthProviders,
  AuthAccounts,
  Favorites,
  FileTasks,
  UserSessions,
  Watchers,
  Audit as _Audit,
  TeamMembers,
  Teams,
} from './db';
import { PageEmbeddings } from '@tcc-docs/db/types/embeddings.types';

// AI Chat
export type AiChat = Selectable<AiChats>;
export type InsertableAiChat = Insertable<AiChats>;
export type UpdatableAiChat = Updateable<Omit<AiChats, 'id'>>;

// AI Chat Message
// `tsv` is an internal tsvector column maintained by a trigger for
// full-text search. It is omitted from the public type so it never leaks
// into HTTP responses or the chat history fed to the language model.
export type AiChatMessage = Omit<Selectable<AiChatMessages>, 'tsv'>;
export type InsertableAiChatMessage = Omit<Insertable<AiChatMessages>, 'tsv'>;

// Workspace
export type Workspace = Selectable<Workspaces>;
export type InsertableWorkspace = Insertable<Workspaces>;
export type UpdatableWorkspace = Updateable<Omit<Workspaces, 'id'>>;

// User
export type User = Selectable<Users>;
export type InsertableUser = Insertable<Users>;
export type UpdatableUser = Updateable<Omit<Users, 'id'>>;

// Team
export type Team = Selectable<Teams>;
export type InsertableTeam = Insertable<Teams>;
export type UpdatableTeam = Updateable<Omit<Teams, 'id'>>;

// TeamMember
export type TeamMember = Selectable<TeamMembers>;
export type InsertableTeamMember = Insertable<TeamMembers>;
export type UpdatableTeamMember = Updateable<Omit<TeamMembers, 'id'>>;

// Space
export type Space = Selectable<Spaces>;
export type InsertableSpace = Insertable<Spaces>;
export type UpdatableSpace = Updateable<Omit<Spaces, 'id'>>;

// SpacePermission
export type SpacePermissionRecord = Selectable<SpacePermissions>;
export type InsertableSpacePermission = Insertable<SpacePermissions>;
export type UpdatableSpacePermission = Updateable<
  Omit<SpacePermissions, 'id'>
>;

// Page
export type Page = Selectable<Pages>;
export type InsertablePage = Insertable<Pages>;
export type UpdatablePage = Updateable<Omit<Pages, 'id'>>;

// Page properties
export type PagePropertyDefinition = Selectable<PagePropertyDefinitions>;
export type InsertablePagePropertyDefinition =
  Insertable<PagePropertyDefinitions>;
export type UpdatablePagePropertyDefinition = Updateable<
  Omit<PagePropertyDefinitions, 'id'>
>;
export type PagePropertyValue = Selectable<PagePropertyValues>;
export type InsertablePagePropertyValue = Insertable<PagePropertyValues>;

// PageHistory
export type PageHistory = Selectable<History>;
export type InsertablePageHistory = Insertable<History>;
export type UpdatablePageHistory = Updateable<Omit<History, 'id'>>;

// Comment
export type Comment = Selectable<Comments>;
export type InsertableComment = Insertable<Comments>;
export type UpdatableComment = Updateable<Omit<Comments, 'id'>>;

// Attachment
export type Attachment = Selectable<Attachments>;
export type InsertableAttachment = Insertable<Attachments>;
export type UpdatableAttachment = Updateable<Omit<Attachments, 'id'>>;

// User Token
export type UserToken = Selectable<UserTokens>;
export type InsertableUserToken = Insertable<UserTokens>;
export type UpdatableUserToken = Updateable<Omit<UserTokens, 'id'>>;

// Backlink
export type Backlink = Selectable<Backlinks>;
export type InsertableBacklink = Insertable<Backlink>;
export type UpdatableBacklink = Updateable<Omit<Backlink, 'id'>>;

// Auth Provider
export type AuthProvider = Selectable<AuthProviders>;
export type InsertableAuthProvider = Insertable<AuthProviders>;
export type UpdatableAuthProvider = Updateable<Omit<AuthProviders, 'id'>>;

// Auth Account
export type AuthAccount = Selectable<AuthAccounts>;
export type InsertableAuthAccount = Insertable<AuthAccounts>;
export type UpdatableAuthAccount = Updateable<Omit<AuthAccounts, 'id'>>;

// Favorite
export type Favorite = Selectable<Favorites>;
export type InsertableFavorite = Insertable<Favorites>;
export type UpdatableFavorite = Updateable<Omit<Favorites, 'id'>>;

// Page Transclusion
export type PageTransclusion = Selectable<PageTransclusions>;
export type InsertablePageTransclusion = Insertable<PageTransclusions>;
export type UpdatablePageTransclusion = Updateable<
  Omit<PageTransclusions, 'id'>
>;

// Page Transclusion Reference
export type PageTransclusionReference = Selectable<PageTransclusionReferences>;
export type InsertablePageTransclusionReference =
  Insertable<PageTransclusionReferences>;
export type UpdatablePageTransclusionReference = Updateable<
  Omit<PageTransclusionReferences, 'id'>
>;

// File Task
export type FileTask = Selectable<FileTasks>;
export type InsertableFileTask = Insertable<FileTasks>;
export type UpdatableFileTask = Updateable<Omit<FileTasks, 'id'>>;

// Page Embedding
export type PageEmbedding = Selectable<PageEmbeddings>;
export type InsertablePageEmbedding = Insertable<PageEmbeddings>;
export type UpdatablePageEmbedding = Updateable<Omit<PageEmbeddings, 'id'>>;

// Notification
export type Notification = Selectable<Notifications>;
export type InsertableNotification = Insertable<Notifications>;
export type UpdatableNotification = Updateable<Omit<Notifications, 'id'>>;

// Watcher
export type Watcher = Selectable<Watchers>;
export type InsertableWatcher = Insertable<Watchers>;
export type UpdatableWatcher = Updateable<Omit<Watchers, 'id'>>;

// Label
export type Label = Selectable<Labels>;
export type InsertableLabel = Insertable<Labels>;
export type UpdatableLabel = Updateable<Omit<Labels, 'id'>>;

// LabelTree
export type LabelTree = Selectable<LabelTrees>;
export type InsertableLabelTree = Insertable<LabelTrees>;
export type UpdatableLabelTree = Updateable<Omit<LabelTrees, 'id'>>;

// Label node closure
export type LabelNodeClosure = Selectable<LabelNodeClosures>;
export type InsertableLabelNodeClosure = Insertable<LabelNodeClosures>;

// PageLabel
export type PageLabel = Selectable<PageLabels>;
export type InsertablePageLabel = Insertable<PageLabels>;

// Page Access
export type PageAccess = Selectable<_PageAccess>;
export type InsertablePageAccess = Insertable<_PageAccess>;
export type UpdatablePageAccess = Updateable<Omit<_PageAccess, 'id'>>;

// Page Permission
export type PagePermission = Selectable<_PagePermissions>;
export type InsertablePagePermission = Insertable<_PagePermissions>;
export type UpdatablePagePermission = Updateable<Omit<_PagePermissions, 'id'>>;

// Page Verification
export type PageVerification = Selectable<_PageVerifications>;
export type InsertablePageVerification = Insertable<_PageVerifications>;
export type UpdatablePageVerification = Updateable<
  Omit<_PageVerifications, 'id'>
>;

// Page Verifier
export type PageVerifier = Selectable<_PageVerifiers>;
export type InsertablePageVerifier = Insertable<_PageVerifiers>;

// User Session
export type UserSession = Selectable<UserSessions>;
export type InsertableUserSession = Insertable<UserSessions>;
export type UpdatableUserSession = Updateable<Omit<UserSessions, 'id'>>;

// Audit
export type Audit = Selectable<_Audit>;
export type InsertableAudit = Insertable<_Audit>;
export type UpdatableAudit = Updateable<Omit<_Audit, 'id'>>;

// Base Property
export type BaseProperty = Selectable<BaseProperties>;
export type InsertableBaseProperty = Insertable<BaseProperties>;
export type UpdatableBaseProperty = Updateable<Omit<BaseProperties, 'id'>>;

// Base Row
export type BaseRow = Selectable<BaseRows>;
export type InsertableBaseRow = Insertable<BaseRows>;
export type UpdatableBaseRow = Updateable<Omit<BaseRows, 'id'>>;

// Base View
export type BaseView = Selectable<BaseViews>;
export type InsertableBaseView = Insertable<BaseViews>;
export type UpdatableBaseView = Updateable<Omit<BaseViews, 'id'>>;
