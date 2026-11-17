import {
  ICurrentPageDraft,
  PageHistoryKind,
} from "@/features/page-history/types/page.types";

/** TCC: publicação removida; o status vem só do tipo da revisão. */
export function getHistoryItemStatus(
  _revisionId: string,
  _pointers: { currentRevisionId: string | null },
  kind: PageHistoryKind | ICurrentPageDraft["kind"],
) {
  return {
    isDraft: kind === "draft",
    isManual: kind === "manual",
    isAutomatic: kind === "automatic",
  };
}
