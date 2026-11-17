import type { IPagination } from "@/lib/types";

interface IPageHistoryUser {
  id: string;
  name: string;
  avatarUrl: string;
}

export type PageHistoryKind = "manual" | "automatic";

export interface IPageHistory {
  id: string;
  pageId: string;
  title: string;
  content?: any;
  slug: string;
  icon: string;
  coverPhoto: string;
  version: number;
  lastUpdatedById: string;
  workspaceId: string;
  createdAt: string;
  updatedAt: string;
  lastUpdatedBy: IPageHistoryUser | null;
  contributors?: IPageHistoryUser[];
  kind: PageHistoryKind;
  description?: string | null;
}

export const CURRENT_DRAFT_HISTORY_ID = "current-page-draft";

export interface ICurrentPageDraft {
  id: typeof CURRENT_DRAFT_HISTORY_ID;
  pageId: string;
  title: string;
  content?: any;
  createdAt: string;
  kind: "draft";
}

export type IPageHistoryItem = IPageHistory | ICurrentPageDraft;

export function isCurrentPageDraft(
  history: IPageHistoryItem,
): history is ICurrentPageDraft {
  return history.kind === "draft";
}

export interface IPrepareHistoryRestoreInput {
  pageId: string;
  historyId: string;
  title: string;
  content: any;
  requestId?: string;
}

export interface IPrepareHistoryRestoreResult {
  snapshot: IPageHistory;
  targetRevisionId: string;
  restoreToken?: string;
}

export type IPageHistoryList = IPagination<IPageHistory> & {
  currentRevisionId: string | null;
};
