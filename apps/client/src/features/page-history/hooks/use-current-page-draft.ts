import { useAtomValue } from "jotai";
import { useEffect, useMemo, useState } from "react";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import { usePageQuery } from "@/features/page/queries/page-query";
import {
  CURRENT_DRAFT_HISTORY_ID,
  ICurrentPageDraft,
} from "@/features/page-history/types/page.types";

function parsePageContent(content?: string): unknown {
  if (!content) return undefined;

  try {
    return JSON.parse(content);
  } catch {
    return undefined;
  }
}

export function useCurrentPageDraft(pageId: string): {
  draft: ICurrentPageDraft;
  canEdit: boolean;
} {
  const pageEditor = useAtomValue(pageEditorAtom);
  const titleEditor = useAtomValue(titleEditorAtom);
  const { data: page } = usePageQuery({ pageId });
  const [editorRevision, setEditorRevision] = useState(0);

  useEffect(() => {
    const syncDraft = () => setEditorRevision((revision) => revision + 1);
    const editors = [pageEditor, titleEditor].filter(
      (editor) => editor && !editor.isDestroyed,
    );

    editors.forEach((editor) => {
      editor.on("transaction", syncDraft);
      editor.on("update", syncDraft);
    });

    return () => {
      editors.forEach((editor) => {
        editor.off("transaction", syncDraft);
        editor.off("update", syncDraft);
      });
    };
  }, [pageEditor, titleEditor]);

  return useMemo(() => {
    const liveContent =
      pageEditor && !pageEditor.isDestroyed ? pageEditor.getJSON() : undefined;
    const liveTitle =
      titleEditor && !titleEditor.isDestroyed
        ? titleEditor.getText()
        : undefined;

    return {
      draft: {
        id: CURRENT_DRAFT_HISTORY_ID,
        pageId,
        title: liveTitle ?? page?.title ?? "",
        content: liveContent ?? parsePageContent(page?.content),
        createdAt: page?.updatedAt
          ? new Date(page.updatedAt).toISOString()
          : new Date().toISOString(),
        kind: "draft",
      },
      canEdit: page?.permissions?.canEdit ?? page?.canEdit ?? false,
    };
  }, [editorRevision, page, pageEditor, pageId, titleEditor]);
}
