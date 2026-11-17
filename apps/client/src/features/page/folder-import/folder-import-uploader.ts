import {
  createFolderImport,
  getAllFolderImportItems,
  startFolderImport,
  uploadFolderImportItem,
} from "./folder-import-service";
import {
  FolderImportEntryKind,
  FolderImportScanResult,
} from "./folder-import-scanner";

interface FolderImportUploadApi {
  create: typeof createFolderImport;
  getAllItems: typeof getAllFolderImportItems;
  uploadItem: typeof uploadFolderImportItem;
  start: typeof startFolderImport;
}

interface UploadFolderImportOptions {
  api?: FolderImportUploadApi;
  concurrency?: number;
  existingSessionId?: string;
  onSessionCreated?: (sessionId: string) => void;
  onProgress?: (progress: { uploaded: number; total: number }) => void;
}

const defaultApi: FolderImportUploadApi = {
  create: createFolderImport,
  getAllItems: getAllFolderImportItems,
  uploadItem: uploadFolderImportItem,
  start: startFolderImport,
};

export async function uploadFolderImport(
  scan: FolderImportScanResult,
  spaceId: string,
  options: UploadFolderImportOptions = {},
) {
  if (scan.blockingIssues.length > 0) {
    throw new Error("Folder contains files above the upload limit");
  }
  const client = options.api ?? defaultApi;
  const created = options.existingSessionId
    ? null
    : await client.create({
        rootName: scan.rootName,
        spaceId,
        entries: scan.entries.map((entry) => ({
          relativePath: entry.relativePath,
          fileSize: entry.fileSize,
          mimeType: entry.mimeType,
          ...(entry.sha256 ? { sha256: entry.sha256 } : {}),
        })),
      });
  const session = created?.session ?? { id: options.existingSessionId! };
  if (created) options.onSessionCreated?.(session.id);

  const serverItems = await client.getAllItems(session.id);
  const entryByPath = new Map(
    scan.entries.map((entry) => [entry.relativePath, entry]),
  );
  const canonicalItems = serverItems.filter(
    (item) => item.status === "pending" || item.status === "uploaded",
  );
  const uploads = canonicalItems.filter((item) => item.status !== "uploaded");
  let uploaded = canonicalItems.length - uploads.length;
  options.onProgress?.({ uploaded, total: canonicalItems.length });

  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < uploads.length) {
      const item = uploads[nextIndex++];
      const entry = entryByPath.get(item.relativePath);
      if (!entry || entry.kind === FolderImportEntryKind.Ignored) {
        throw new Error(`Folder import file not found: ${item.relativePath}`);
      }
      await client.uploadItem(session.id, item.id, entry.file);
      uploaded++;
      options.onProgress?.({ uploaded, total: canonicalItems.length });
    }
  };
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? 3, uploads.length || 1),
  );
  await Promise.all(Array.from({ length: concurrency }, worker));
  const processing = await client.start(session.id);
  return { session, processing };
}
