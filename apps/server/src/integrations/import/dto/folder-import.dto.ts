export enum FolderImportEntryKind {
  Ignored = 'ignored',
  Document = 'document',
  Pdf = 'pdf',
  Image = 'image',
  Video = 'video',
  Attachment = 'attachment',
}

export enum FolderImportSessionStatus {
  Uploading = 'uploading',
  Processing = 'processing',
  Success = 'success',
  Partial = 'partial',
  Failed = 'failed',
  Cancelled = 'cancelled',
}

export enum FolderImportItemStatus {
  Pending = 'pending',
  Uploaded = 'uploaded',
  Processing = 'processing',
  Success = 'success',
  Failed = 'failed',
  Ignored = 'ignored',
  Duplicate = 'duplicate',
}

export interface FolderImportManifestEntryInput {
  relativePath: string;
  fileSize: number;
  mimeType?: string;
  sha256?: string;
}

export interface FolderImportManifestEntry extends FolderImportManifestEntryInput {
  relativePath: string;
  fileName: string;
  kind: FolderImportEntryKind;
  sha256: string | null;
  duplicateOfPath: string | null;
}

export interface FolderImportManifestSummary {
  totalEntries: number;
  importableEntries: number;
  ignoredEntries: number;
  duplicateEntries: number;
  totalBytes: number;
  effectiveBytes: number;
  duplicateBytes: number;
  ignoredBytes: number;
}

export interface FolderImportManifest {
  entries: FolderImportManifestEntry[];
  directories: string[];
  summary: FolderImportManifestSummary;
}

export interface CreateFolderImportSessionInput {
  rootName: string;
  manifest: FolderImportManifest;
  creatorId: string;
  spaceId: string;
  workspaceId: string;
}
