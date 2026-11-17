import type { Editor } from "@tiptap/react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  changedDocumentBlockIds,
  serializeTopLevelBlocks,
} from "../domain/assisted-writing";
import { buildSafeRevert } from "../domain/safe-revert";
import { plainText } from "../text";
import type { UndoRecord } from "../types";
import type { PageMetadata } from "./use-page-metadata";

export interface EditedBlock {
  id: string;
  text: string;
}

interface Options {
  editor: Editor | null;
  undo: UndoRecord | undefined;
  metadata: PageMetadata;
  /** Replaces or drops the stored undo record. */
  setUndo: (undo: UndoRecord | undefined) => void;
  onFailure: (message: string) => void;
}

export function isUndoAvailable(undo: UndoRecord | undefined): boolean {
  if (!undo) return false;
  const versionAlive =
    !!undo.expiresAt && Date.parse(undo.expiresAt) > Date.now();
  return (
    versionAlive ||
    undo.previousTitle !== undefined ||
    (undo.labelChanges?.length ?? 0) > 0
  );
}

/**
 * Takes back the last accepted proposal. When blocks changed after it was
 * applied, nothing is overwritten until the user chooses between a full
 * restore and reverting only the AI's untouched blocks.
 */
export function useUndo({
  editor,
  undo,
  metadata,
  setUndo,
  onFailure,
}: Options) {
  const { t } = useTranslation();
  const [editedSince, setEditedSince] = useState<EditedBlock[]>([]);

  const revertMetadata = useCallback(async () => {
    if (!undo) return;
    if (undo.previousTitle !== undefined) {
      await metadata.setTitle(undo.previousTitle);
    }
    for (const change of undo.labelChanges ?? []) {
      if (change.action === "add_label") {
        await metadata.removeLabel(change.labelId);
      } else {
        await metadata.restoreLabel(change.labelId);
      }
    }
    setUndo({ ...undo, previousTitle: undefined, labelChanges: undefined });
  }, [metadata, setUndo, undo]);

  const guarded = useCallback(
    async (action: () => Promise<void>) => {
      try {
        await action();
      } catch (cause: any) {
        onFailure(
          t("Could not undo: {{reason}}", {
            reason: cause?.message ?? t("unknown error"),
          }),
        );
      }
    },
    [onFailure, t],
  );

  const start = useCallback(
    () =>
      guarded(async () => {
        if (!editor || !undo) return;
        const touchedMetadata =
          undo.previousTitle !== undefined ||
          (undo.labelChanges?.length ?? 0) > 0;
        if (touchedMetadata) await revertMetadata();
        if (!undo.snapshot || !undo.acceptedDocument) {
          setUndo(undefined);
          return;
        }
        const now = await serializeTopLevelBlocks(editor.getJSON());
        const accepted = await serializeTopLevelBlocks(undo.acceptedDocument);
        const nowById = new Map(now.map((b) => [b.blockId, b]));
        const changed = changedDocumentBlockIds(accepted, now);
        if (changed.length) {
          setEditedSince(
            changed.map((id) => ({
              id,
              text:
                plainText(nowById.get(id)?.source).slice(0, 100) ||
                t("[removed]"),
            })),
          );
          return;
        }
        editor.commands.setContent(undo.snapshot);
        setUndo(undefined);
      }),
    [editor, guarded, revertMetadata, setUndo, t, undo],
  );

  const revertUntouchedBlocks = useCallback(
    () =>
      guarded(async () => {
        if (!editor || !undo?.snapshot || !undo.acceptedDocument) return;
        const transaction = await buildSafeRevert(
          editor.state,
          undo.snapshot,
          undo.acceptedDocument,
          new Set(editedSince.map((block) => block.id)),
        );
        if (transaction) editor.view.dispatch(transaction);
        // Blocks edited afterwards stay as they are, so there is no single
        // snapshot to go back to; the record is spent either way.
        setUndo(undefined);
        setEditedSince([]);
      }),
    [editedSince, editor, guarded, setUndo, undo],
  );

  const restoreWholePage = useCallback(
    () =>
      guarded(async () => {
        if (!editor || !undo) return;
        await revertMetadata();
        if (undo.snapshot) editor.commands.setContent(undo.snapshot);
        setUndo(undefined);
        setEditedSince([]);
      }),
    [editor, guarded, revertMetadata, setUndo, undo],
  );

  const dismissWarning = useCallback(() => setEditedSince([]), []);

  return {
    editedSince,
    start,
    revertUntouchedBlocks,
    restoreWholePage,
    dismissWarning,
  };
}
