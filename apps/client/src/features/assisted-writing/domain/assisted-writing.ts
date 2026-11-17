import type { JSONContent } from "@tiptap/core";

export const EDITABLE_BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "table",
]);

export interface GenerationBlock {
  blockId: string;
  type: string;
  hash: string;
  content?: unknown;
  editable: boolean;
}

export interface GenerationRequest {
  tenantId?: never;
  pageId: string;
  sessionId: string;
  request: string;
  blocks: GenerationBlock[];
  selectedBlockIds?: string[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  partialContext?: boolean;
  title?: string;
  labels?: string[];
  availableLabels?: string[];
}

export type ProposalOperation =
  | {
      action: "replace";
      blockId: string;
      baseHash: string;
      content: JSONContent[];
      attrs?: Record<string, unknown>;
    }
  | { action: "delete"; blockId: string; baseHash: string }
  | {
      action: "insert_after";
      afterBlockId: string;
      blockType:
        | "paragraph"
        | "heading"
        | "bulletList"
        | "orderedList"
        | "taskList"
        | "table";
      content: JSONContent[];
      attrs?: Record<string, unknown>;
    }
  | { action: "set_title"; title: string }
  | { action: "add_label"; label: string }
  | { action: "remove_label"; label: string };

/** Operations that mutate the ProseMirror document (go through buildProposalTransaction). */
export type BlockOperation = Extract<
  ProposalOperation,
  { action: "replace" | "delete" | "insert_after" }
>;

/** Operations that mutate page metadata (title, labels) via REST, not the editor doc. */
export type PageOperation = Extract<
  ProposalOperation,
  { action: "set_title" | "add_label" | "remove_label" }
>;

export function isBlockOperation(
  operation: ProposalOperation,
): operation is BlockOperation {
  return (
    operation.action === "replace" ||
    operation.action === "delete" ||
    operation.action === "insert_after"
  );
}

export function isPageOperation(
  operation: ProposalOperation,
): operation is PageOperation {
  return !isBlockOperation(operation);
}

// The input token budget is enforced authoritatively by the AI service, which
// counts the final serialized payload with the model's own tokenizer. The client
// sends the whole page and surfaces the 422 if it comes back.
export interface PreparedContext {
  blocks: GenerationBlock[];
  selectedBlockIds?: string[];
}

export function canonicalStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalStringify).join(",")}]`;
  }
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .filter((key) => record[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalStringify(record[key])}`)
    .join(",")}}`;
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function hashBlock(node: JSONContent): Promise<string> {
  return sha256Hex(canonicalStringify(node));
}

// `source` is the original node, kept for local UI needs such as undo diffing.
// publicBlock strips it before anything leaves the browser.
export async function serializeTopLevelBlocks(
  document: JSONContent,
): Promise<Array<GenerationBlock & { source: JSONContent }>> {
  return Promise.all(
    (document.content ?? []).map(async (node, index) => {
      const blockId = node.attrs?.id;
      if (typeof blockId !== "string" || !blockId) {
        throw new Error(`Top-level block ${index} is missing id`);
      }
      const hash = await hashBlock(node);
      const editable = EDITABLE_BLOCK_TYPES.has(node.type ?? "");
      return {
        blockId,
        type: node.type ?? "unknown",
        hash,
        ...(editable ? { content: node } : {}),
        editable,
        source: node,
      };
    }),
  );
}

function publicBlock(
  block: GenerationBlock & { source: JSONContent },
): GenerationBlock {
  const { source: _source, ...result } = block;
  return result;
}

export async function prepareGenerationContext(
  document: JSONContent,
  selectedBlockIds: string[] = [],
): Promise<PreparedContext> {
  const all = await serializeTopLevelBlocks(document);
  const selectedSet = new Set(selectedBlockIds);
  const selected = all
    .filter((block) => selectedSet.has(block.blockId))
    .map((block) => block.blockId);
  return {
    blocks: all.map(publicBlock),
    ...(selected.length ? { selectedBlockIds: selected } : {}),
  };
}

export function selectedTopLevelBlockIds(
  document: {
    descendants: (fn: (node: any, pos: number) => false | void) => void;
  },
  from: number,
  to: number,
): string[] {
  if (from === to) return [];
  const ids: string[] = [];
  document.descendants((node: any, pos: number) => {
    if (node.type?.name === "doc") return;
    const end = pos + node.nodeSize;
    if (pos < to && end > from && node.attrs?.id) ids.push(node.attrs.id);
    return false;
  });
  return ids;
}

export function changedBlocksSinceSnapshot(
  snapshot: GenerationBlock[],
  current: GenerationBlock[],
): GenerationBlock[] {
  const initial = new Map(snapshot.map((block) => [block.blockId, block.hash]));
  return current.filter((block) => initial.get(block.blockId) !== block.hash);
}

export function changedDocumentBlockIds(
  accepted: GenerationBlock[],
  current: GenerationBlock[],
): string[] {
  const acceptedHashes = new Map(
    accepted.map((block) => [block.blockId, block.hash]),
  );
  const currentHashes = new Map(
    current.map((block) => [block.blockId, block.hash]),
  );
  const ids = new Set([...acceptedHashes.keys(), ...currentHashes.keys()]);
  return [...ids].filter(
    (id) => acceptedHashes.get(id) !== currentHashes.get(id),
  );
}
