import {
  FolderImportEntryKind,
  FolderImportManifest,
  FolderImportManifestEntry,
  FolderImportManifestEntryInput,
} from '../dto/folder-import.dto';

const IGNORED_FILE_NAMES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);
const IGNORED_DIRECTORY_NAMES = new Set([
  '__macosx',
  '.spotlight-v100',
  '.trashes',
]);
const DOCUMENT_EXTENSIONS = new Set([
  '.docx',
  '.html',
  '.htm',
  '.md',
  '.markdown',
]);
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.heic',
  '.heif',
  '.avif',
]);
const VIDEO_EXTENSIONS = new Set([
  '.mp4',
  '.mov',
  '.m4v',
  '.webm',
  '.avi',
  '.mkv',
]);
const SHA_256_PATTERN = /^[a-f0-9]{64}$/i;
const WINDOWS_ABSOLUTE_PATH_PATTERN = /^[a-z]:\//i;
const collator = new Intl.Collator('pt-BR', {
  numeric: true,
  sensitivity: 'base',
});

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  return lastDot > 0 ? fileName.slice(lastDot).toLowerCase() : '';
}

function isIgnoredPath(relativePath: string): boolean {
  const segments = relativePath.toLowerCase().split('/');
  return segments.some((segment) => IGNORED_DIRECTORY_NAMES.has(segment));
}

export function classifyFolderImportEntry(
  fileName: string,
): FolderImportEntryKind {
  const normalizedFileName = fileName.normalize('NFC');
  const lowerFileName = normalizedFileName.toLowerCase();

  if (
    IGNORED_FILE_NAMES.has(lowerFileName) ||
    normalizedFileName.startsWith('~$')
  ) {
    return FolderImportEntryKind.Ignored;
  }

  const extension = getExtension(normalizedFileName);
  if (DOCUMENT_EXTENSIONS.has(extension)) {
    return FolderImportEntryKind.Document;
  }
  if (extension === '.pdf') {
    return FolderImportEntryKind.Pdf;
  }
  if (IMAGE_EXTENSIONS.has(extension)) {
    return FolderImportEntryKind.Image;
  }
  if (VIDEO_EXTENSIONS.has(extension)) {
    return FolderImportEntryKind.Video;
  }
  return FolderImportEntryKind.Attachment;
}

export function normalizeFolderImportPath(relativePath: string): string {
  if (!relativePath || relativePath.includes('\0')) {
    throw new Error('Invalid folder import path');
  }

  const normalizedSeparators = relativePath.replaceAll('\\', '/');
  if (
    normalizedSeparators.startsWith('/') ||
    WINDOWS_ABSOLUTE_PATH_PATTERN.test(normalizedSeparators)
  ) {
    throw new Error('Invalid folder import path');
  }

  const segments = normalizedSeparators.split('/');
  if (
    segments.some(
      (segment) => segment === '' || segment === '.' || segment === '..',
    )
  ) {
    throw new Error('Invalid folder import path');
  }

  return segments.map((segment) => segment.normalize('NFC')).join('/');
}

function collectDirectories(
  relativePath: string,
  directories: Set<string>,
): void {
  const segments = relativePath.split('/');
  segments.pop();

  for (let index = 1; index <= segments.length; index++) {
    directories.add(segments.slice(0, index).join('/'));
  }
}

function sortDirectories(left: string, right: string): number {
  const depthDifference = left.split('/').length - right.split('/').length;
  return depthDifference || collator.compare(left, right);
}

export function buildFolderImportManifest(
  inputEntries: FolderImportManifestEntryInput[],
): FolderImportManifest {
  const seenPaths = new Set<string>();
  const canonicalPathByHash = new Map<string, string>();
  const sizeByHash = new Map<string, number>();
  const directories = new Set<string>();
  const entries: FolderImportManifestEntry[] = [];

  let importableEntries = 0;
  let ignoredEntries = 0;
  let duplicateEntries = 0;
  let totalBytes = 0;
  let effectiveBytes = 0;
  let duplicateBytes = 0;
  let ignoredBytes = 0;

  for (const inputEntry of inputEntries) {
    if (!Number.isSafeInteger(inputEntry.fileSize) || inputEntry.fileSize < 0) {
      throw new Error('Invalid folder import file size');
    }

    const relativePath = normalizeFolderImportPath(inputEntry.relativePath);
    if (seenPaths.has(relativePath)) {
      throw new Error('Duplicate folder import path');
    }
    seenPaths.add(relativePath);

    const fileName = relativePath.slice(relativePath.lastIndexOf('/') + 1);
    let kind = classifyFolderImportEntry(fileName);
    if (isIgnoredPath(relativePath)) {
      kind = FolderImportEntryKind.Ignored;
    }

    totalBytes += inputEntry.fileSize;

    if (kind === FolderImportEntryKind.Ignored) {
      ignoredEntries++;
      ignoredBytes += inputEntry.fileSize;
      entries.push({
        ...inputEntry,
        relativePath,
        fileName,
        kind,
        sha256: null,
        duplicateOfPath: null,
      });
      continue;
    }

    if (!inputEntry.sha256 || !SHA_256_PATTERN.test(inputEntry.sha256)) {
      throw new Error('Invalid folder import SHA-256');
    }

    importableEntries++;
    collectDirectories(relativePath, directories);

    const sha256 = inputEntry.sha256.toLowerCase();
    const duplicateOfPath = canonicalPathByHash.get(sha256) ?? null;
    if (duplicateOfPath) {
      if (sizeByHash.get(sha256) !== inputEntry.fileSize) {
        throw new Error('Folder import hash has inconsistent file sizes');
      }
      duplicateEntries++;
      duplicateBytes += inputEntry.fileSize;
    } else {
      canonicalPathByHash.set(sha256, relativePath);
      sizeByHash.set(sha256, inputEntry.fileSize);
      effectiveBytes += inputEntry.fileSize;
    }

    entries.push({
      ...inputEntry,
      relativePath,
      fileName,
      kind,
      sha256,
      duplicateOfPath,
    });
  }

  return {
    entries,
    directories: [...directories].sort(sortDirectories),
    summary: {
      totalEntries: entries.length,
      importableEntries,
      ignoredEntries,
      duplicateEntries,
      totalBytes,
      effectiveBytes,
      duplicateBytes,
      ignoredBytes,
    },
  };
}
