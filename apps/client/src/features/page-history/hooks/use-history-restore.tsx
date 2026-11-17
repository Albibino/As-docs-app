import { useAtomValue, useSetAtom } from "jotai";
import { useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { useParams } from "react-router-dom";
import type { Editor } from "@tiptap/core";
import {
  activeHistoryIdAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import {
  usePageHistoryQuery,
  usePrepareHistoryRestoreMutation,
} from "@/features/page-history/queries/page-history-query";
import { CURRENT_DRAFT_HISTORY_ID } from "@/features/page-history/types/page.types";
import {
  pageEditorAtom,
  titleEditorAtom,
  yjsSyncedAtom,
} from "@/features/editor/atoms/editor-atoms";
import { useUpdateTitlePageMutation } from "@/features/page/queries/page-query";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from "@/features/space/permissions/permissions.type";

function applyEditorContent(
  editor: Editor,
  content: unknown,
  emitUpdate: boolean,
) {
  const accepted = editor
    .chain()
    .clearContent()
    .setContent(content, { emitUpdate })
    .run();

  if (!accepted) {
    throw new Error("Editor rejected restored content");
  }
}

function getRestoreErrorKey(error: unknown): string {
  const response = (
    error as {
      response?: {
        status?: number;
        data?: { message?: unknown; statusCode?: number };
      };
    }
  )?.response;
  const message = response?.data?.message;
  const status = response?.status ?? response?.data?.statusCode;

  if (
    message === "History revision mismatch" ||
    message === "Page history not found"
  ) {
    return "This version is no longer available for this page.";
  }

  if (status === 403 || message === "Forbidden") {
    return "You no longer have permission to edit this page.";
  }

  if (message === "Page not found") {
    return "Page not found";
  }

  return "Failed to restore version";
}

export function useHistoryRestore() {
  const { t } = useTranslation();

  const activeHistoryId = useAtomValue(activeHistoryIdAtom);
  const isCurrentDraft = activeHistoryId === CURRENT_DRAFT_HISTORY_ID;
  const { data: activeHistoryData, isLoading: isTargetLoading } =
    usePageHistoryQuery(isCurrentDraft ? undefined : activeHistoryId);

  const mainEditor = useAtomValue(pageEditorAtom);
  const mainEditorTitle = useAtomValue(titleEditorAtom);
  const yjsSynced = useAtomValue(yjsSyncedAtom);
  const setActiveHistoryId = useSetAtom(activeHistoryIdAtom);
  const setHistoryModalOpen = useSetAtom(historyAtoms);
  const confirmationOpenRef = useRef(false);
  const restoreInFlightRef = useRef(false);

  const { mutateAsync: prepareHistoryRestore, isPending: isPreparingRestore } =
    usePrepareHistoryRestoreMutation();
  const { mutateAsync: updateTitlePage, isPending: isUpdatingTitle } =
    useUpdateTitlePageMutation();

  const { spaceSlug } = useParams();
  const { data: space } = useSpaceQuery(spaceSlug);
  const spaceAbility = useSpaceAbility(space?.permission);

  const canRestore =
    !isCurrentDraft &&
    spaceAbility.can(SpaceCaslAction.Edit, SpaceCaslSubject.Page);
  const isRestoring = isPreparingRestore || isUpdatingTitle;
  const isRestoreDisabled =
    !activeHistoryData || isTargetLoading || isRestoring;

  const handleRestore = useCallback(async () => {
    if (restoreInFlightRef.current) return;
    if (
      !activeHistoryData ||
      !mainEditor ||
      !mainEditorTitle ||
      mainEditor.isDestroyed ||
      mainEditorTitle.isDestroyed
    ) {
      confirmationOpenRef.current = false;
      notifications.show({
        color: "red",
        message: t("Failed to restore version"),
      });
      return;
    }

    if (!yjsSynced) {
      confirmationOpenRef.current = false;
      notifications.show({
        color: "red",
        message: t("The page is still syncing. Try again in a moment."),
      });
      return;
    }

    restoreInFlightRef.current = true;
    const liveTitle =
      mainEditorTitle.getText() ?? activeHistoryData.title ?? "";
    const liveContent = mainEditor.getJSON() ??
      activeHistoryData.content ?? { type: "doc" };
    const targetTitle = activeHistoryData.title ?? "";
    const pageId = activeHistoryData.pageId;
    let titlePersisted = false;
    let titleEditorAttempted = false;
    let pageEditorAttempted = false;

    try {
      await prepareHistoryRestore({
        pageId,
        historyId: activeHistoryData.id,
        title: liveTitle,
        content: liveContent,
        requestId: crypto.randomUUID(),
      });

      if (targetTitle !== liveTitle) {
        await updateTitlePage({ pageId, title: targetTitle });
        titlePersisted = true;
      }

      titleEditorAttempted = true;
      applyEditorContent(mainEditorTitle, targetTitle, false);

      pageEditorAttempted = true;
      applyEditorContent(mainEditor, activeHistoryData.content, true);

      setActiveHistoryId(CURRENT_DRAFT_HISTORY_ID);
      setHistoryModalOpen(false);
      notifications.show({
        message: t(
          "Version restored; your previous draft is available in history.",
        ),
      });
    } catch (error) {
      if (pageEditorAttempted) {
        try {
          applyEditorContent(mainEditor, liveContent, true);
        } catch {
          // The editor is already failing; keep the modal open for a retry.
        }
      }

      if (titleEditorAttempted) {
        try {
          applyEditorContent(mainEditorTitle, liveTitle, false);
        } catch {
          // The editor is already failing; the persisted title is still rolled back.
        }
      }

      if (titlePersisted) {
        try {
          await updateTitlePage({ pageId, title: liveTitle });
        } catch {
          // The snapshot remains available even if this compensating request fails.
        }
      }

      notifications.show({
        color: "red",
        message: t(getRestoreErrorKey(error)),
      });
    } finally {
      restoreInFlightRef.current = false;
      confirmationOpenRef.current = false;
    }
  }, [
    activeHistoryData,
    mainEditor,
    mainEditorTitle,
    prepareHistoryRestore,
    setActiveHistoryId,
    setHistoryModalOpen,
    t,
    updateTitlePage,
    yjsSynced,
  ]);

  const confirmRestore = useCallback(() => {
    if (
      !canRestore ||
      isRestoreDisabled ||
      confirmationOpenRef.current ||
      restoreInFlightRef.current
    ) {
      return;
    }

    confirmationOpenRef.current = true;

    modals.openConfirmModal({
      title: t("Please confirm your action"),
      children: (
        <Text size="sm">
          {t(
            "The current draft will be saved before restoring this version. New changes will be saved after one minute.",
          )}
        </Text>
      ),
      labels: { confirm: t("Restore version"), cancel: t("Cancel") },
      onConfirm: handleRestore,
      onCancel: () => {
        confirmationOpenRef.current = false;
      },
      onClose: () => {
        if (!restoreInFlightRef.current) {
          confirmationOpenRef.current = false;
        }
      },
    });
  }, [canRestore, handleRestore, isRestoreDisabled, t]);

  return {
    canRestore,
    confirmRestore,
    isRestoreDisabled,
    isRestoring,
  };
}
