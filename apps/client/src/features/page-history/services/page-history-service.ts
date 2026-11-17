import api from "@/lib/api-client";
import {
  IPageHistory,
  IPageHistoryList,
  IPrepareHistoryRestoreInput,
  IPrepareHistoryRestoreResult,
} from "@/features/page-history/types/page.types";

export async function prepareHistoryRestore(
  data: IPrepareHistoryRestoreInput,
): Promise<IPrepareHistoryRestoreResult> {
  const req = await api.post<IPrepareHistoryRestoreResult>(
    "/pages/history/snapshot-before-restore",
    data,
  );
  return req.data;
}

export async function getPageHistoryList(
  pageId: string,
  cursor?: string,
): Promise<IPageHistoryList> {
  const req = await api.post("/pages/history", {
    pageId,
    cursor,
  });
  return req.data;
}

export async function getPageHistoryById(
  historyId: string,
): Promise<IPageHistory> {
  const req = await api.post<IPageHistory>("/pages/history/info", {
    historyId,
  });
  return req.data;
}
