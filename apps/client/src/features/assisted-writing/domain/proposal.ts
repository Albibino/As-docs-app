import type { JSONContent } from "@tiptap/core";
import { Fragment, type Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { v4 as uuidv4 } from "uuid";
import {
  EDITABLE_BLOCK_TYPES,
  hashBlock,
  type BlockOperation,
} from "./assisted-writing";

export interface ProposalConflict {
  operation: BlockOperation;
  reason: "block_missing" | "hash_changed" | "opaque_block" | "invalid_content";
}

export interface ProposalApplication {
  transaction: Transaction | null;
  applied: BlockOperation[];
  conflicts: ProposalConflict[];
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
}

interface LocatedBlock {
  node: ProseMirrorNode;
  pos: number;
}

function topLevelById(document: ProseMirrorNode): Map<string, LocatedBlock> {
  const result = new Map<string, LocatedBlock>();
  document.forEach((node, offset) => {
    if (node.attrs.id) result.set(node.attrs.id, { node, pos: offset });
  });
  return result;
}

async function nodeHash(node: ProseMirrorNode): Promise<string> {
  return hashBlock(node.toJSON() as JSONContent);
}

export async function buildProposalTransaction(
  state: EditorState,
  operations: BlockOperation[],
): Promise<ProposalApplication> {
  const initial = topLevelById(state.doc);
  const safe: BlockOperation[] = [];
  const conflicts: ProposalConflict[] = [];
  const beforeHashes: Record<string, string> = {};

  for (const operation of operations) {
    const id =
      operation.action === "insert_after"
        ? operation.afterBlockId
        : operation.blockId;
    const located = initial.get(id);
    if (!located) {
      conflicts.push({ operation, reason: "block_missing" });
      continue;
    }
    if (
      operation.action !== "insert_after" &&
      !EDITABLE_BLOCK_TYPES.has(located.node.type.name)
    ) {
      conflicts.push({ operation, reason: "opaque_block" });
      continue;
    }
    const currentHash = await nodeHash(located.node);
    beforeHashes[id] = currentHash;
    if (
      operation.action !== "insert_after" &&
      currentHash !== operation.baseHash
    ) {
      conflicts.push({ operation, reason: "hash_changed" });
      continue;
    }
    safe.push(operation);
  }

  if (!safe.length) {
    return {
      transaction: null,
      applied: [],
      conflicts,
      beforeHashes,
      afterHashes: {},
    };
  }

  let transaction = state.tr;
  const insertedIds: string[] = [];
  // Resolve each position against transaction doc. Insert order stays payload order.
  for (const operation of safe) {
    const current = topLevelById(transaction.doc);
    const id =
      operation.action === "insert_after"
        ? operation.afterBlockId
        : operation.blockId;
    const located = current.get(id);
    if (!located) {
      conflicts.push({ operation, reason: "block_missing" });
      continue;
    }
    try {
      if (operation.action === "delete") {
        transaction = transaction.delete(
          located.pos,
          located.pos + located.node.nodeSize,
        );
      } else if (operation.action === "replace") {
        const content = Fragment.fromJSON(
          state.schema,
          operation.content as unknown[],
        );
        const replacement = located.node.type.create(
          { ...located.node.attrs, ...operation.attrs },
          content,
          located.node.marks,
        );
        transaction = transaction.replaceWith(
          located.pos,
          located.pos + located.node.nodeSize,
          replacement,
        );
      } else {
        const type = state.schema.nodes[operation.blockType];
        if (!type || !EDITABLE_BLOCK_TYPES.has(type.name)) throw new Error();
        const content = Fragment.fromJSON(
          state.schema,
          operation.content as unknown[],
        );
        const insertedId = uuidv4();
        const inserted = type.create(
          {
            ...operation.attrs,
            ...("id" in type.spec.attrs ? { id: insertedId } : {}),
          },
          content,
        );
        if (inserted.attrs.id) insertedIds.push(inserted.attrs.id);
        transaction = transaction.insert(
          located.pos + located.node.nodeSize,
          inserted,
        );
      }
    } catch {
      conflicts.push({ operation, reason: "invalid_content" });
    }
  }

  const applied = safe.filter(
    (operation) =>
      !conflicts.some((conflict) => conflict.operation === operation),
  );
  if (!applied.length) {
    return {
      transaction: null,
      applied,
      conflicts,
      beforeHashes,
      afterHashes: {},
    };
  }

  const afterHashes: Record<string, string> = {};
  const after = topLevelById(transaction.doc);
  for (const operation of applied) {
    const id =
      operation.action === "insert_after" ? undefined : operation.blockId;
    if (id && after.has(id))
      afterHashes[id] = await nodeHash(after.get(id)!.node);
  }
  for (const id of insertedIds) {
    if (after.has(id)) afterHashes[id] = await nodeHash(after.get(id)!.node);
  }
  return { transaction, applied, conflicts, beforeHashes, afterHashes };
}

export function proposalPreviewJson(
  current: JSONContent,
  operation: BlockOperation,
): JSONContent | null {
  if (operation.action === "delete") return null;
  if (operation.action === "insert_after") {
    return { type: operation.blockType, content: operation.content };
  }
  return { ...current, content: operation.content };
}
