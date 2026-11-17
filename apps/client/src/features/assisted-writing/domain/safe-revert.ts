import type { JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import { hashBlock } from "./assisted-writing";

interface Located {
  node: ProseMirrorNode;
  pos: number;
}

function locate(doc: ProseMirrorNode): Map<string, Located> {
  const found = new Map<string, Located>();
  doc.forEach((node, pos) => {
    if (node.attrs.id) found.set(node.attrs.id, { node, pos });
  });
  return found;
}

const idOf = (block: JSONContent): string | undefined => block.attrs?.id;

/**
 * Undo that spares later edits. Walks the blocks the AI touched and puts the
 * original back only where the block is still exactly what the AI left:
 *  - blocks the AI inserted are removed;
 *  - blocks the AI rewrote get their previous content back;
 *  - blocks the AI deleted are reinserted next to their old neighbours.
 * Blocks listed in `skipIds` (edited after the application) are left alone.
 * Returns null when there is nothing to change.
 */
export async function buildSafeRevert(
  state: EditorState,
  snapshot: JSONContent,
  accepted: JSONContent,
  skipIds: ReadonlySet<string> = new Set(),
): Promise<Transaction | null> {
  const before = snapshot.content ?? [];
  const after = accepted.content ?? [];
  const beforeById = new Map(before.map((b) => [idOf(b), b]));
  const afterIds = new Set(after.map(idOf));
  let tr = state.tr;

  for (const block of after) {
    const id = idOf(block);
    if (!id || skipIds.has(id)) continue;
    const here = locate(tr.doc).get(id);
    if (!here) continue;
    const untouched =
      (await hashBlock(here.node.toJSON())) === (await hashBlock(block));
    if (!untouched) continue;
    const original = beforeById.get(id);
    const end = here.pos + here.node.nodeSize;
    if (!original) {
      tr = tr.delete(here.pos, end);
    } else if ((await hashBlock(original)) !== (await hashBlock(block))) {
      tr = tr.replaceWith(here.pos, end, state.schema.nodeFromJSON(original));
    }
  }

  before.forEach((original, index) => {
    const id = idOf(original);
    if (!id || afterIds.has(id)) return;
    const current = locate(tr.doc);
    if (current.has(id)) return;
    const previous = before
      .slice(0, index)
      .reverse()
      .map((b) => current.get(idOf(b) as string))
      .find(Boolean);
    const next = before
      .slice(index + 1)
      .map((b) => current.get(idOf(b) as string))
      .find(Boolean);
    const pos = previous
      ? previous.pos + previous.node.nodeSize
      : (next?.pos ?? 0);
    tr = tr.insert(pos, state.schema.nodeFromJSON(original));
  });

  return tr.docChanged ? tr : null;
}
