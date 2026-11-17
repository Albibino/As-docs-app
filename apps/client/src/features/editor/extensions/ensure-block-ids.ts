import type { Editor } from "@tiptap/react";
import { generateNodeId } from "@tcc-docs/editor-ext";

/** Repairs missing/duplicate top-level IDs in one local transaction. */
export function ensureTopLevelBlockIds(editor: Editor): boolean {
  const seen = new Set<string>();
  let transaction = editor.state.tr;
  let changed = false;
  editor.state.doc.forEach((node, pos) => {
    if (!("id" in node.attrs)) return;
    const id = node.attrs.id as string | null;
    if (!id || seen.has(id)) {
      transaction = transaction.setNodeAttribute(pos, "id", generateNodeId());
      changed = true;
      return;
    }
    seen.add(id);
  });
  if (changed) editor.view.dispatch(transaction);
  return changed;
}
