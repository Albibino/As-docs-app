import type { JSONContent } from "@tiptap/core";
import type {
  GenerationBlock,
  ProposalOperation,
} from "./domain/assisted-writing";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

/** A label change made together with a proposal; kept so it can be reverted. */
export interface LabelChange {
  action: "add_label" | "remove_label";
  labelId: string;
  name: string;
}

/** Everything needed to take back the last accepted proposal. */
export interface UndoRecord {
  snapshot?: JSONContent;
  acceptedDocument?: JSONContent;
  afterHashes?: Record<string, string>;
  operations?: ProposalOperation[];
  versionId?: string;
  applicationId?: string;
  expiresAt?: string;
  previousTitle?: string;
  labelChanges?: LabelChange[];
}

/** Conversation state of one page, persisted in localStorage per page. */
export interface WritingSession {
  id: string;
  lastActive: number;
  history: ChatTurn[];
  /** Blocks as they were when the conversation started. */
  baseline?: GenerationBlock[];
  undo?: UndoRecord;
}
