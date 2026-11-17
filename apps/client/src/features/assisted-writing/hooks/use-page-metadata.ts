import { useCallback } from "react";
import {
  useApplyLabelMutation,
  useCreatePageLabelMutation,
  useRemovePageLabelMutation,
} from "@/features/label/queries/label-query";
import {
  updatePageData,
  useUpdateTitlePageMutation,
} from "@/features/page/queries/page-query";
import { useQueryEmit } from "@/features/websocket/use-query-emit.ts";
import localEmitter from "@/lib/local-emitter.ts";
import type { UpdateEvent } from "@/features/websocket/types";

/**
 * Title and label changes of a page, the parts of a proposal that do not go
 * through the editor document. Other open views are told about a rename.
 */
export function usePageMetadata(pageId: string) {
  const updateTitle = useUpdateTitlePageMutation();
  const createLabel = useCreatePageLabelMutation(pageId);
  const removeLabel = useRemovePageLabelMutation(pageId);
  const applyLabel = useApplyLabelMutation(pageId);
  const emit = useQueryEmit();

  const setTitle = useCallback(
    async (title: string) => {
      const page = await updateTitle.mutateAsync({ pageId, title });
      updatePageData(page);
      const event: UpdateEvent = {
        operation: "updateOne",
        spaceId: page.spaceId,
        entity: ["pages"],
        id: page.id,
        payload: {
          title: page.title,
          slugId: page.slugId,
          parentPageId: page.parentPageId,
          icon: page.icon,
        },
      };
      localEmitter.emit("message", event);
      emit(event);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pageId, updateTitle.mutateAsync, emit],
  );

  return {
    setTitle,
    createLabel: (name: string) => createLabel.mutateAsync({ pageId, name }),
    removeLabel: (labelId: string) =>
      removeLabel.mutateAsync({ pageId, labelId }),
    restoreLabel: (labelId: string) =>
      applyLabel.mutateAsync({ pageId, labelId }),
  };
}

export type PageMetadata = ReturnType<typeof usePageMetadata>;
