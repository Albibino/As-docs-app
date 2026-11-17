export const MAX_FOLDER_IMPORT_FILE_SIZE = 100 * 1024 * 1024;

export enum FolderImportEntryKind {
  Ignored = "ignored",
  Document = "document",
  Pdf = "pdf",
  Image = "image",
  Video = "video",
  Attachment = "attachment",
}

export interface FolderImportScannedEntry {
  file: File;
  relativePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  sha256: string | null;
  kind: FolderImportEntryKind;
  duplicateOfPath: string | null;
}

export interface FolderImportScanResult {
  rootName: string;
  entries: FolderImportScannedEntry[];
  blockingIssues: Array<{
    relativePath: string;
    reason: "too-large";
    fileSize: number;
  }>;
  summary: {
    totalEntries: number;
    importableEntries: number;
    ignoredEntries: number;
    duplicateEntries: number;
    totalBytes: number;
    effectiveBytes: number;
    duplicateBytes: number;
    ignoredBytes: number;
  };
}

interface ScanFolderImportOptions {
  hashFile?: (file: File) => Promise<string>;
  maxFileSize?: number;
  onProgress?: (progress: { completed: number; total: number }) => void;
}

const ignoredNames = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);
const documentExtensions = new Set([
  ".docx",
  ".html",
  ".htm",
  ".md",
  ".markdown",
]);
const imageExtensions = new Set([
  ".avif",
  ".gif",
  ".heic",
  ".heif",
  ".jpeg",
  ".jpg",
  ".png",
  ".svg",
  ".webp",
]);
const videoExtensions = new Set([
  ".avi",
  ".m4v",
  ".mkv",
  ".mov",
  ".mp4",
  ".mpeg",
  ".mpg",
  ".webm",
]);
const collator = new Intl.Collator("pt-BR", {
  numeric: true,
  sensitivity: "base",
});

export async function scanFolderImportFiles(
  selectedFiles: Iterable<File>,
  options: ScanFolderImportOptions = {},
): Promise<FolderImportScanResult> {
  const files = [...selectedFiles];
  if (files.length === 0) throw new Error("Folder has no files");

  const { rootName, relativePaths } = resolveRelativePaths(files);
  const maxFileSize = options.maxFileSize ?? MAX_FOLDER_IMPORT_FILE_SIZE;
  const hashFile = options.hashFile ?? hashFolderImportFile;
  const hashableCount = files.filter((file, index) => {
    const kind = classifyFolderImportEntry(relativePaths[index]);
    return kind !== FolderImportEntryKind.Ignored && file.size <= maxFileSize;
  }).length;
  let completed = 0;
  options.onProgress?.({ completed, total: hashableCount });

  const canonicalPathByHash = new Map<string, string>();
  const entries: FolderImportScannedEntry[] = [];
  const blockingIssues: FolderImportScanResult["blockingIssues"] = [];

  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const relativePath = relativePaths[index];
    const fileName = relativePath.slice(relativePath.lastIndexOf("/") + 1);
    const kind = classifyFolderImportEntry(relativePath);
    let sha256: string | null = null;
    let duplicateOfPath: string | null = null;

    if (kind !== FolderImportEntryKind.Ignored) {
      if (file.size > maxFileSize) {
        blockingIssues.push({
          relativePath,
          reason: "too-large",
          fileSize: file.size,
        });
      } else {
        sha256 = await hashFile(file);
        duplicateOfPath = canonicalPathByHash.get(sha256) ?? null;
        if (!duplicateOfPath) canonicalPathByHash.set(sha256, relativePath);
        completed++;
        options.onProgress?.({ completed, total: hashableCount });
      }
    }

    entries.push({
      file,
      relativePath,
      fileName,
      fileSize: file.size,
      mimeType: file.type || "application/octet-stream",
      sha256,
      kind,
      duplicateOfPath,
    });
  }

  entries.sort((left, right) =>
    collator.compare(left.relativePath, right.relativePath),
  );
  return {
    rootName,
    entries,
    blockingIssues,
    summary: summarizeEntries(entries),
  };
}

export function readFolderRootName(selectedFiles: Iterable<File>) {
  const files = [...selectedFiles];
  if (files.length === 0) return null;
  try {
    return resolveRelativePaths(files).rootName;
  } catch {
    return null;
  }
}

export function classifyFolderImportEntry(relativePath: string) {
  const segments = relativePath.split("/");
  const fileName = segments.at(-1)!;
  if (
    ignoredNames.has(fileName) ||
    fileName.startsWith("~$") ||
    segments.some((segment) => segment === "__MACOSX")
  ) {
    return FolderImportEntryKind.Ignored;
  }
  const extensionIndex = fileName.lastIndexOf(".");
  const extension =
    extensionIndex >= 0 ? fileName.slice(extensionIndex).toLowerCase() : "";
  if (documentExtensions.has(extension)) return FolderImportEntryKind.Document;
  if (extension === ".pdf") return FolderImportEntryKind.Pdf;
  if (imageExtensions.has(extension)) return FolderImportEntryKind.Image;
  if (videoExtensions.has(extension)) return FolderImportEntryKind.Video;
  return FolderImportEntryKind.Attachment;
}

async function hashFolderImportFile(file: File) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await file.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function resolveRelativePaths(files: File[]) {
  const normalizedPaths = files.map((file) =>
    (file.webkitRelativePath || file.name)
      .replaceAll("\\", "/")
      .normalize("NFC"),
  );
  const firstSegments = normalizedPaths.map(
    (filePath) => filePath.split("/")[0],
  );
  const hasFolderRoot = normalizedPaths.every((filePath) =>
    filePath.includes("/"),
  );
  const rootName = hasFolderRoot ? firstSegments[0] : "Imported folder";
  if (hasFolderRoot && firstSegments.some((segment) => segment !== rootName)) {
    throw new Error("Selected files do not share one folder root");
  }
  return {
    rootName,
    relativePaths: normalizedPaths.map((filePath) =>
      hasFolderRoot ? filePath.slice(rootName.length + 1) : filePath,
    ),
  };
}

function summarizeEntries(entries: FolderImportScannedEntry[]) {
  const summary = {
    totalEntries: entries.length,
    importableEntries: 0,
    ignoredEntries: 0,
    duplicateEntries: 0,
    totalBytes: 0,
    effectiveBytes: 0,
    duplicateBytes: 0,
    ignoredBytes: 0,
  };
  for (const entry of entries) {
    summary.totalBytes += entry.fileSize;
    if (entry.kind === FolderImportEntryKind.Ignored) {
      summary.ignoredEntries++;
      summary.ignoredBytes += entry.fileSize;
      continue;
    }
    summary.importableEntries++;
    if (entry.duplicateOfPath) {
      summary.duplicateEntries++;
      summary.duplicateBytes += entry.fileSize;
    } else {
      summary.effectiveBytes += entry.fileSize;
    }
  }
  return summary;
}
