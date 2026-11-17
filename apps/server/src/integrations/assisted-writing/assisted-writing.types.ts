export interface AssistedWritingBlock {
  blockId: string;
  type: string;
  hash: string;
  content?: unknown;
  editable: boolean;
}

export interface AssistedWritingInput {
  pageId: string;
  sessionId: string;
  request: string;
  blocks: AssistedWritingBlock[];
  selectedBlockIds?: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  partialContext?: boolean;
  title?: string;
  labels?: string[];
  availableLabels?: string[];
}

/**
 * Title-only reference to a page the model may link to. Never carries content:
 * the index exists so the model can emit page mention nodes with a real pageId.
 * slugId is for the client, which turns a pageId back into a complete mention;
 * only {pageId, title} is forwarded upstream.
 */
export interface SpacePageRef {
  pageId: string;
  slugId: string;
  title: string;
}

export interface SAiGenerationRequest {
  tenantId: string;
  sessionId: string;
  request: string;
  blocks: AssistedWritingBlock[];
  selectedBlockIds?: string[];
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  partialContext?: boolean;
  title?: string;
  labels?: string[];
  availableLabels?: string[];
  spacePages?: Array<{ pageId: string; title: string }>;
}

export interface AssistedWritingVersionInput {
  pageId: string;
  sessionId: string;
  content: unknown;
  operations: unknown[];
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
}
