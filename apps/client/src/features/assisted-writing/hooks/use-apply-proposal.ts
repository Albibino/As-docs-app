import type { Editor } from "@tiptap/react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { usePageLabelsQuery } from "@/features/label/queries/label-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import {
  isBlockOperation,
  isPageOperation,
  type ProposalOperation,
} from "../domain/assisted-writing";
import { findFreePageLabelByName } from "../domain/label-context";
import { operationLabel } from "../domain/operation-label";
import { buildProposalTransaction } from "../domain/proposal";
import { recordApplication } from "../services/session-api";
import type { LabelChange, UndoRecord } from "../types";
import type { PageMetadata } from "./use-page-metadata";

export interface ApplyOutcome {
  /** Operations that could not be applied, already worded for the user. */
  conflicts: string[];
  /** Present when something changed and can be taken back. */
  undo?: UndoRecord;
}

interface Options {
  editor: Editor | null;
  pageId: string;
  sessionId: string;
  metadata: PageMetadata;
}

/**
 * Applies an accepted proposal: title and label changes through the API first,
 * then every document operation in one editor transaction. The document is only
 * touched after the server has stored the pre-edit version.
 */
export function useApplyProposal({
  editor,
  pageId,
  sessionId,
  metadata,
}: Options) {
  const { t } = useTranslation();
  const { data: page } = usePageQuery({ pageId });
  const { data: pageLabels } = usePageLabelsQuery(pageId);

  const conflictReason = useCallback(
    (reason: string) => {
      switch (reason) {
        case "block_missing":
          return t("the block no longer exists");
        case "hash_changed":
          return t("the block was edited in the meantime");
        case "opaque_block":
          return t("this kind of block cannot be edited by the AI");
        case "invalid_content":
          return t("the proposed content is invalid");
        default:
          return reason;
      }
    },
    [t],
  );

  return useCallback(
    async (operations: ProposalOperation[]): Promise<ApplyOutcome> => {
      if (!editor || !operations.length) {
        return { conflicts: [t("Invalid proposed content.")] };
      }
      const conflicts: string[] = [];
      const labelChanges: LabelChange[] = [];
      let previousTitle: string | undefined;

      for (const op of operations.filter(isPageOperation)) {
        try {
          if (op.action === "set_title") {
            const before = page?.title ?? "";
            await metadata.setTitle(op.title);
            previousTitle = before;
          } else if (op.action === "add_label") {
            const created = await metadata.createLabel(op.label);
            labelChanges.push({
              action: "add_label",
              labelId: created.id,
              name: created.name,
            });
          } else {
            const existing = findFreePageLabelByName(pageLabels, op.label);
            if (!existing) {
              conflicts.push(
                `${operationLabel(op)}: ${t("label not found on the page")}`,
              );
              continue;
            }
            await metadata.removeLabel(existing.id);
            labelChanges.push({
              action: "remove_label",
              labelId: existing.id,
              name: existing.name,
            });
          }
        } catch (cause: any) {
          conflicts.push(
            `${operationLabel(op)}: ${cause?.message ?? t("failed to apply")}`,
          );
        }
      }

      let documentUndo: UndoRecord = {};
      const blockOps = operations.filter(isBlockOperation);
      if (blockOps.length) {
        const snapshot = editor.getJSON();
        const built = await buildProposalTransaction(editor.state, blockOps);
        conflicts.push(
          ...built.conflicts.map(
            (item) =>
              `${operationLabel(item.operation)}: ${conflictReason(item.reason)}`,
          ),
        );
        if (built.transaction && built.applied.length) {
          try {
            const version = await recordApplication({
              pageId,
              sessionId,
              content: snapshot,
              operations: built.applied,
              beforeHashes: built.beforeHashes,
              afterHashes: built.afterHashes,
            });
            editor.view.dispatch(built.transaction);
            documentUndo = {
              snapshot,
              acceptedDocument: built.transaction.doc.toJSON(),
              afterHashes: built.afterHashes,
              operations: built.applied,
              versionId: version.versionId,
              applicationId: version.applicationId,
              expiresAt: version.expiresAt,
            };
          } catch (cause: any) {
            conflicts.push(
              t("Acceptance cancelled: {{reason}}", {
                reason: cause?.message ?? t("could not save the version"),
              }),
            );
          }
        }
      }

      const changedSomething =
        documentUndo.snapshot !== undefined ||
        previousTitle !== undefined ||
        labelChanges.length > 0;
      return {
        conflicts,
        undo: changedSomething
          ? {
              ...documentUndo,
              previousTitle,
              labelChanges: labelChanges.length ? labelChanges : undefined,
            }
          : undefined,
      };
    },
    [conflictReason, editor, metadata, page, pageId, pageLabels, sessionId, t],
  );
}
