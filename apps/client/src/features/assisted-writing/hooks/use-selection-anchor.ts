import type { Editor } from "@tiptap/react";
import { useEffect, useState } from "react";
import { selectedTopLevelBlockIds } from "../domain/assisted-writing";

export interface SelectionAnchor {
  /** Top-level blocks touched by the current text selection. */
  blockIds: string[];
  /** Viewport position just under the selection, for a floating button. */
  position?: { top: number; left: number };
}

const EMPTY: SelectionAnchor = { blockIds: [] };

/** Follows the editor's text selection. */
export function useSelectionAnchor(editor: Editor | null): SelectionAnchor {
  const [anchor, setAnchor] = useState<SelectionAnchor>(EMPTY);

  useEffect(() => {
    if (!editor) return;
    const refresh = () => {
      const { from, to, empty } = editor.state.selection;
      if (empty || !editor.state.doc.textBetween(from, to).trim()) {
        setAnchor(EMPTY);
        return;
      }
      const start = editor.view.coordsAtPos(from);
      const end = editor.view.coordsAtPos(to);
      setAnchor({
        blockIds: selectedTopLevelBlockIds(editor.state.doc, from, to),
        position: {
          top: Math.max(start.bottom, end.bottom) + 8,
          left: (start.left + end.left) / 2,
        },
      });
    };
    editor.on("selectionUpdate", refresh);
    refresh();
    return () => {
      editor.off("selectionUpdate", refresh);
    };
  }, [editor]);

  return anchor;
}
