import { usePageHistoryQuery } from "@/features/page-history/queries/page-history-query";
import { HistoryEditor } from "@/features/page-history/components/history-editor";
import { useTranslation } from "react-i18next";
import { useAtomValue } from "jotai";
import {
  activeHistoryIdAtom,
  activeHistoryPrevIdAtom,
} from "@/features/page-history/atoms/history-atoms";
import { useCurrentPageDraft } from "@/features/page-history/hooks";
import { CURRENT_DRAFT_HISTORY_ID } from "@/features/page-history/types/page.types";

interface Props {
  pageId: string;
}

function HistoryView({ pageId }: Props) {
  const { t } = useTranslation();
  const historyId = useAtomValue(activeHistoryIdAtom);
  const prevHistoryId = useAtomValue(activeHistoryPrevIdAtom);
  const { draft } = useCurrentPageDraft(pageId);
  const isDraft = historyId === CURRENT_DRAFT_HISTORY_ID;

  const {
    data,
    isLoading: isLoadingCurrent,
    isError: isErrorCurrent,
  } = usePageHistoryQuery(isDraft ? "" : historyId);
  const {
    data: prevData,
    isLoading: isLoadingPrev,
    isError: isErrorPrev,
  } = usePageHistoryQuery(prevHistoryId);

  if (isLoadingCurrent || isLoadingPrev) {
    return <></>;
  }

  if (!isDraft && (isErrorCurrent || !data)) {
    return <div>{t("Error fetching page data.")}</div>;
  }

  return (
    <div>
      <HistoryEditor
        content={isDraft ? draft.content : data?.content}
        title={isDraft ? draft.title : (data?.title ?? "")}
        previousContent={!isErrorPrev ? prevData?.content : undefined}
      />
    </div>
  );
}

export default HistoryView;
