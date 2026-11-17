import api from "@/lib/api-client";

export type FolderImportSessionStatus =
  | "uploading"
  | "processing"
  | "success"
  | "partial"
  | "failed"
  | "cancelled";

export interface FolderImportSession {
  id: string;
  fileName: string;
  spaceId: string;
  workspaceId: string;
  status: FolderImportSessionStatus;
  errorMessage: string | null;
}

export interface FolderImportItem {
  id: string;
  relativePath: string;
  status: string;
  errorMessage?: string | null;
  duplicateOfId?: string | null;
}

export interface FolderImportReport {
  total: number;
  pending: number;
  uploaded: number;
  processing: number;
  imported: number;
  failed: number;
  ignored: number;
  duplicates: number;
}

export interface FolderImportResult {
  session: FolderImportSession;
  report: FolderImportReport;
  items?: FolderImportItem[];
  pagination?: {
    nextCursor: string | null;
  };
}

interface CreateFolderImportInput {
  rootName: string;
  spaceId: string;
  entries: Array<{
    relativePath: string;
    fileSize: number;
    mimeType?: string;
    sha256?: string;
  }>;
}

export async function createFolderImport(input: CreateFolderImportInput) {
  const response = await api.post<FolderImportResult>("/folder-imports", input);
  return response.data;
}

export async function getFolderImport(
  sessionId: string,
  cursor?: string,
): Promise<FolderImportResult> {
  const response = await api.get<FolderImportResult>(
    `/folder-imports/${sessionId}`,
    { params: { limit: 100, cursor } },
  );
  return response.data;
}

export async function getAllFolderImportItems(sessionId: string) {
  const items: FolderImportItem[] = [];
  let cursor: string | undefined;
  do {
    const result = await getFolderImport(sessionId, cursor);
    items.push(...(result.items ?? []));
    cursor = result.pagination?.nextCursor ?? undefined;
  } while (cursor);
  return items;
}

export async function uploadFolderImportItem(
  sessionId: string,
  itemId: string,
  file: File,
) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await api.put<FolderImportItem>(
    `/folder-imports/${sessionId}/items/${itemId}/content`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return response.data;
}

export async function startFolderImport(sessionId: string) {
  const response = await api.post<FolderImportResult>(
    `/folder-imports/${sessionId}/start`,
  );
  return response.data;
}

export async function retryFolderImport(sessionId: string) {
  const response = await api.post<FolderImportResult>(
    `/folder-imports/${sessionId}/retry`,
  );
  return response.data;
}

export async function cancelFolderImport(sessionId: string) {
  const response = await api.post<FolderImportResult>(
    `/folder-imports/${sessionId}/cancel`,
  );
  return response.data;
}
