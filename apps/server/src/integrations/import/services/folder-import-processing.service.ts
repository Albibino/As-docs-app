import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { InjectKysely } from 'nestjs-kysely';
import * as path from 'path';
import { Readable } from 'stream';
import * as mammoth from 'mammoth';
import { KyselyDB } from '../../../database/types/kysely.types';
import { Json } from '../../../database/types/db';
import type { User } from '../../../database/types/entity.types';
import { PageService } from '../../../core/page/services/page.service';
import { AttachmentService } from '../../../core/attachment/services/attachment.service';
import { StorageService } from '../../storage/storage.service';
import type { ImportService } from './import.service';
import {
  getDocxImportFileTitle,
  omittedDocxImageAttributes,
  removeOmittedDocxImages,
  sha256DocxImage,
  shouldOmitDocxImageHash,
} from '../utils/docx-import.utils';
import {
  FolderImportEntryKind,
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';

interface FolderImportAttachmentNodeInput {
  id: string;
  fileName: string;
  fileSize: string | number | bigint;
  mimeType: string | null;
  kind: FolderImportEntryKind;
}

interface ProcessedFolderImportItem {
  pageId: string;
  attachmentId?: string;
  node?: Record<string, unknown>;
  content?: Record<string, unknown>;
}

interface FolderImportMetadata {
  directories?: string[];
  directoryPageIds?: Record<string, string>;
}

export const FOLDER_IMPORT_CONVERTER = Symbol('FOLDER_IMPORT_CONVERTER');

type FolderImportConverter = Pick<
  ImportService,
  | 'processHTML'
  | 'processMarkdown'
  | 'createYdoc'
  | 'extractTitleAndRemoveHeading'
>;

type FolderImportItem = Awaited<
  ReturnType<FolderImportProcessingRepo['getProcessingData']>
>['items'][number];

type FolderImportSession = Awaited<
  ReturnType<FolderImportProcessingRepo['getProcessingData']>
>['session'];

export function buildFolderImportAttachmentNode(
  attachment: FolderImportAttachmentNodeInput,
) {
  const url = `/api/files/${attachment.id}/${attachment.fileName}`;
  const size = Number(attachment.fileSize);
  const extension = path.extname(attachment.fileName).toLowerCase();

  if (
    attachment.kind === FolderImportEntryKind.Image &&
    !['.heic', '.heif'].includes(extension)
  ) {
    return {
      type: 'image',
      attrs: {
        src: url,
        alt: attachment.fileName,
        attachmentId: attachment.id,
        size,
        align: 'center',
      },
    };
  }
  if (attachment.kind === FolderImportEntryKind.Video) {
    return {
      type: 'video',
      attrs: {
        src: url,
        alt: attachment.fileName,
        attachmentId: attachment.id,
        size,
        align: 'center',
      },
    };
  }
  if (attachment.kind === FolderImportEntryKind.Pdf) {
    return {
      type: 'pdf',
      attrs: {
        src: url,
        name: attachment.fileName,
        attachmentId: attachment.id,
        size,
        width: 800,
        height: 600,
      },
    };
  }
  return {
    type: 'attachment',
    attrs: {
      url,
      name: attachment.fileName,
      mime: attachment.mimeType ?? 'application/octet-stream',
      size,
      attachmentId: attachment.id,
    },
  };
}

@Injectable()
export class FolderImportProcessingRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async getProcessingData(sessionId: string) {
    const session = await this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', sessionId)
      .where('source', '=', 'folder')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
    if (!session) {
      throw new NotFoundException('Folder import session not found');
    }

    const items = await this.db
      .selectFrom('fileTaskItems')
      .selectAll()
      .where('fileTaskId', '=', sessionId)
      .where('status', 'in', [
        FolderImportItemStatus.Uploaded,
        FolderImportItemStatus.Duplicate,
        FolderImportItemStatus.Processing,
        FolderImportItemStatus.Failed,
        FolderImportItemStatus.Success,
      ])
      .orderBy('relativePath', 'asc')
      .execute();
    return { session, items };
  }

  async markProcessing(itemId: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({
        status: FolderImportItemStatus.Processing,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where('id', '=', itemId)
      .execute();
  }

  async markSuccess(
    itemId: string,
    result: { pageId: string; attachmentId?: string },
  ) {
    await this.db
      .updateTable('fileTaskItems')
      .set({
        status: FolderImportItemStatus.Success,
        pageId: result.pageId,
        attachmentId: result.attachmentId ?? null,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where('id', '=', itemId)
      .execute();
  }

  async markFailed(itemId: string, errorMessage: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({
        status: FolderImportItemStatus.Failed,
        errorMessage: errorMessage.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where('id', '=', itemId)
      .execute();
  }

  async recordPage(itemId: string, pageId: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({ pageId, updatedAt: new Date() })
      .where('id', '=', itemId)
      .execute();
  }

  async recordAttachment(itemId: string, attachmentId: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({ attachmentId, updatedAt: new Date() })
      .where('id', '=', itemId)
      .execute();
  }

  async recordRootPage(sessionId: string, pageId: string) {
    await this.db
      .updateTable('fileTasks')
      .set({ pageId, updatedAt: new Date() })
      .where('id', '=', sessionId)
      .execute();
  }

  async recordDirectoryPage(
    sessionId: string,
    metadata: FolderImportMetadata,
    directory: string,
    pageId: string,
  ) {
    const nextMetadata: FolderImportMetadata = {
      ...metadata,
      directoryPageIds: {
        ...metadata.directoryPageIds,
        [directory]: pageId,
      },
    };
    await this.db
      .updateTable('fileTasks')
      .set({ metadata: nextMetadata as Json, updatedAt: new Date() })
      .where('id', '=', sessionId)
      .execute();
    return nextMetadata;
  }

  async getPageContent(pageId: string) {
    return this.db
      .selectFrom('pages')
      .select('content')
      .where('id', '=', pageId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async getAttachment(attachmentId: string) {
    return this.db
      .selectFrom('attachments')
      .select(['id', 'fileName', 'fileSize', 'mimeType'])
      .where('id', '=', attachmentId)
      .where('deletedAt', 'is', null)
      .executeTakeFirst();
  }

  async isCancelled(sessionId: string) {
    const task = await this.db
      .selectFrom('fileTasks')
      .select('status')
      .where('id', '=', sessionId)
      .executeTakeFirst();
    return task?.status === FolderImportSessionStatus.Cancelled;
  }

  async updatePageContent(
    pageId: string,
    content: Record<string, unknown>,
    ydoc: Buffer | null,
    userId: string,
  ) {
    await this.db
      .updateTable('pages')
      .set({
        content: content as Json,
        textContent: extractText(content),
        ydoc,
        lastUpdatedById: userId,
        updatedAt: new Date(),
      })
      .where('id', '=', pageId)
      .execute();
  }
}

@Injectable()
export class FolderImportProcessingService {
  constructor(
    private readonly repo: FolderImportProcessingRepo,
    private readonly pageService: PageService,
    private readonly attachmentService: AttachmentService,
    private readonly storageService: StorageService,
    @Inject(FOLDER_IMPORT_CONVERTER)
    private readonly importService: FolderImportConverter,
  ) {}

  async processSession(sessionId: string) {
    const { session, items } = await this.repo.getProcessingData(sessionId);
    if (!session.creatorId || !session.spaceId) {
      throw new Error('Folder import session has no creator or space');
    }

    let metadata = (session.metadata ?? {}) as FolderImportMetadata;
    const directories = this.getDirectories(metadata, items);
    const pageByDirectory = new Map<string, { id: string }>();
    const nodesByDirectory = new Map<string, Record<string, unknown>[]>();

    for (const directory of directories) {
      const existingPageId = metadata.directoryPageIds?.[directory];
      if (existingPageId) {
        pageByDirectory.set(directory, { id: existingPageId });
        continue;
      }
      const parentDirectory = getParentDirectory(directory);
      const page = await this.pageService.create(
        session.creatorId,
        session.workspaceId,
        {
          title: path.posix.basename(directory),
          spaceId: session.spaceId,
          parentPageId: pageByDirectory.get(parentDirectory)?.id,
        },
      );
      pageByDirectory.set(directory, page);
      metadata = await this.repo.recordDirectoryPage(
        session.id,
        metadata,
        directory,
        page.id,
      );
    }

    const actionableItems = items.filter((item) =>
      [
        FolderImportItemStatus.Uploaded,
        FolderImportItemStatus.Duplicate,
        FolderImportItemStatus.Processing,
        FolderImportItemStatus.Failed,
      ].includes(item.status as FolderImportItemStatus),
    );
    const canonicalItems = actionableItems.filter(
      (item) => !item.duplicateOfId,
    );
    const duplicateItems = actionableItems.filter((item) => item.duplicateOfId);
    const processedByItemId = new Map<string, ProcessedFolderImportItem>();
    for (const item of items) {
      if (item.status === FolderImportItemStatus.Success) {
        const existing = await this.loadExistingResult(item);
        if (existing) processedByItemId.set(item.id, existing);
      }
    }
    let processed = 0;
    let failed = 0;
    let cancelled = false;

    for (const item of canonicalItems) {
      if (await this.repo.isCancelled(sessionId)) {
        cancelled = true;
        break;
      }
      try {
        await this.repo.markProcessing(item.id);
        const result = await this.processCanonicalItem({
          item,
          session,
          pageByDirectory,
          nodesByDirectory,
        });
        processedByItemId.set(item.id, result);
        await this.repo.markSuccess(item.id, result);
        processed++;
      } catch (error) {
        await this.repo.markFailed(item.id, getErrorMessage(error));
        failed++;
      }
    }

    for (const item of cancelled ? [] : duplicateItems) {
      if (await this.repo.isCancelled(sessionId)) {
        cancelled = true;
        break;
      }
      try {
        await this.repo.markProcessing(item.id);
        const canonical = processedByItemId.get(item.duplicateOfId!);
        if (!canonical) {
          throw new Error('Canonical folder import item was not processed');
        }
        const result = await this.processDuplicateItem(
          item,
          canonical,
          session,
          pageByDirectory,
          nodesByDirectory,
        );
        await this.repo.markSuccess(item.id, result);
        processed++;
      } catch (error) {
        await this.repo.markFailed(item.id, getErrorMessage(error));
        failed++;
      }
    }

    return { processed, failed, cancelled };
  }

  private async processCanonicalItem(opts: {
    item: FolderImportItem;
    session: FolderImportSession;
    pageByDirectory: Map<string, { id: string }>;
    nodesByDirectory: Map<string, Record<string, unknown>[]>;
  }): Promise<ProcessedFolderImportItem> {
    const { item, session, pageByDirectory, nodesByDirectory } = opts;
    const parentDirectory = getParentDirectory(item.relativePath);

    if (item.kind === FolderImportEntryKind.Document) {
      const page = await this.createItemPage(item, session, pageByDirectory);
      const content = await this.convertDocument(item, page.id, session);
      await this.savePageContent(page.id, content, session);
      return { pageId: page.id, content };
    }

    if (item.kind === FolderImportEntryKind.Pdf) {
      const page = await this.createItemPage(item, session, pageByDirectory);
      const attachment = await this.uploadAttachment(item, page.id, session);
      const node = buildFolderImportAttachmentNode({
        ...attachment,
        kind: FolderImportEntryKind.Pdf,
      });
      const content = { type: 'doc', content: [node] };
      await this.savePageContent(page.id, content, session);
      return {
        pageId: page.id,
        attachmentId: attachment.id,
        node,
        content,
      };
    }

    const parentPage = await this.getMediaParentPage(
      parentDirectory,
      session,
      pageByDirectory,
      nodesByDirectory,
    );
    const attachment = await this.uploadAttachment(
      item,
      parentPage.id,
      session,
    );
    const node = buildFolderImportAttachmentNode({
      ...attachment,
      kind: item.kind as FolderImportEntryKind,
    });
    await this.appendDirectoryNode(
      parentDirectory,
      node,
      parentPage.id,
      session,
      nodesByDirectory,
    );
    return {
      pageId: parentPage.id,
      attachmentId: attachment.id,
      node,
    };
  }

  private async processDuplicateItem(
    item: FolderImportItem,
    canonical: ProcessedFolderImportItem,
    session: FolderImportSession,
    pageByDirectory: Map<string, { id: string }>,
    nodesByDirectory: Map<string, Record<string, unknown>[]>,
  ): Promise<ProcessedFolderImportItem> {
    if (item.kind === FolderImportEntryKind.Document) {
      const page = await this.createItemPage(item, session, pageByDirectory);
      await this.savePageContent(page.id, canonical.content!, session);
      return { pageId: page.id, content: canonical.content };
    }
    if (item.kind === FolderImportEntryKind.Pdf) {
      const page = await this.createItemPage(item, session, pageByDirectory);
      await this.savePageContent(page.id, canonical.content!, session);
      return {
        pageId: page.id,
        attachmentId: canonical.attachmentId,
        node: canonical.node,
        content: canonical.content,
      };
    }

    const parentDirectory = getParentDirectory(item.relativePath);
    const parentPage = await this.getMediaParentPage(
      parentDirectory,
      session,
      pageByDirectory,
      nodesByDirectory,
    );
    await this.appendDirectoryNode(
      parentDirectory,
      structuredClone(canonical.node!),
      parentPage.id,
      session,
      nodesByDirectory,
    );
    return {
      pageId: parentPage.id,
      attachmentId: canonical.attachmentId,
      node: canonical.node,
    };
  }

  private async createItemPage(
    item: FolderImportItem,
    session: FolderImportSession,
    pageByDirectory: Map<string, { id: string }>,
  ) {
    if (item.pageId) return { id: item.pageId };
    const originalExtension = path.extname(item.fileName);
    const extension = originalExtension.toLowerCase();
    const page = await this.pageService.create(
      session.creatorId!,
      session.workspaceId,
      {
        title:
          extension === '.docx'
            ? getDocxImportFileTitle(item.fileName)
            : path.basename(item.fileName, originalExtension),
        spaceId: session.spaceId!,
        parentPageId: pageByDirectory.get(getParentDirectory(item.relativePath))
          ?.id,
      },
    );
    await this.repo.recordPage(item.id, page.id);
    item.pageId = page.id;
    return page;
  }

  private async getMediaParentPage(
    directory: string,
    session: FolderImportSession,
    pageByDirectory: Map<string, { id: string }>,
    nodesByDirectory: Map<string, Record<string, unknown>[]>,
  ) {
    const existing = pageByDirectory.get(directory);
    if (existing) return existing;

    const rootPage = session.pageId
      ? { id: session.pageId }
      : await this.pageService.create(session.creatorId!, session.workspaceId, {
          title: session.fileName,
          spaceId: session.spaceId!,
        });
    if (!session.pageId) {
      await this.repo.recordRootPage(session.id, rootPage.id);
      session.pageId = rootPage.id;
    }
    pageByDirectory.set('', rootPage);
    return rootPage;
  }

  private async convertDocument(
    item: FolderImportItem,
    pageId: string,
    session: FolderImportSession,
  ) {
    if (!item.storagePath)
      throw new Error('Folder import item was not uploaded');
    const extension = path.extname(item.fileName).toLowerCase();
    const fileBuffer = await this.storageService.read(item.storagePath);
    let state;

    if (extension === '.docx') {
      let embeddedImageIndex = 0;
      const result = await mammoth.convertToHtml(
        { buffer: fileBuffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const imageBuffer = await image.readAsBuffer();
            const imageHash = sha256DocxImage(imageBuffer);
            if (shouldOmitDocxImageHash(imageHash)) {
              return omittedDocxImageAttributes() as any;
            }
            embeddedImageIndex++;
            const imageFileName = `embedded-${embeddedImageIndex}${extensionForMimeType(
              image.contentType,
            )}`;
            const attachment = await this.uploadBufferAttachment(
              imageBuffer,
              imageFileName,
              pageId,
              session,
            );
            return {
              src: `/api/files/${attachment.id}/${attachment.fileName}`,
              'data-attachment-id': attachment.id,
            } as any;
          }),
        },
      );
      state = await this.importService.processHTML(
        removeOmittedDocxImages(result.value),
      );
    } else if (['.md', '.markdown'].includes(extension)) {
      state = await this.importService.processMarkdown(
        fileBuffer.toString('utf8'),
      );
    } else {
      state = await this.importService.processHTML(fileBuffer.toString('utf8'));
    }

    return this.importService.extractTitleAndRemoveHeading(state, {
      anyHeadingLevel: true,
    }).prosemirrorJson;
  }

  private async uploadAttachment(
    item: FolderImportItem,
    pageId: string,
    session: FolderImportSession,
  ) {
    if (item.attachmentId) {
      const existing = await this.repo.getAttachment(item.attachmentId);
      if (existing) return existing;
    }
    if (!item.storagePath)
      throw new Error('Folder import item was not uploaded');
    const stream = await this.storageService.readStream(item.storagePath);
    const attachment = await this.uploadStreamAttachment(
      stream,
      item.fileName,
      pageId,
      session,
    );
    await this.repo.recordAttachment(item.id, attachment.id);
    item.attachmentId = attachment.id;
    return attachment;
  }

  private async uploadBufferAttachment(
    buffer: Buffer,
    fileName: string,
    pageId: string,
    session: FolderImportSession,
  ) {
    return this.uploadStreamAttachment(
      Readable.from(buffer),
      fileName,
      pageId,
      session,
    );
  }

  private async uploadStreamAttachment(
    stream: Readable,
    fileName: string,
    pageId: string,
    session: FolderImportSession,
  ) {
    const multipartFile = {
      filename: fileName,
      file: stream,
    } as MultipartFile;
    const attachment = await this.attachmentService.uploadFile({
      filePromise: Promise.resolve(multipartFile),
      pageId,
      userId: session.creatorId!,
      spaceId: session.spaceId!,
      workspaceId: session.workspaceId,
    });
    if (!attachment) throw new Error(`Failed to attach ${fileName}`);
    return attachment;
  }

  private async savePageContent(
    pageId: string,
    content: Record<string, unknown>,
    session: FolderImportSession,
  ) {
    await this.repo.updatePageContent(
      pageId,
      content,
      await this.importService.createYdoc(content),
      session.creatorId!,
    );
    await this.pageService.updatePageContent(
      pageId,
      content,
      'replace',
      'json',
      { id: session.creatorId! } as User,
    );
  }

  private async appendDirectoryNode(
    directory: string,
    node: Record<string, unknown>,
    pageId: string,
    session: FolderImportSession,
    nodesByDirectory: Map<string, Record<string, unknown>[]>,
  ) {
    let nodes = nodesByDirectory.get(directory);
    if (!nodes) {
      const page = await this.repo.getPageContent(pageId);
      nodes = getDocumentNodes(page?.content);
      nodesByDirectory.set(directory, nodes);
    }
    nodes.push(node);
    await this.savePageContent(
      pageId,
      { type: 'doc', content: nodes },
      session,
    );
  }

  private async loadExistingResult(
    item: FolderImportItem,
  ): Promise<ProcessedFolderImportItem | null> {
    if (!item.pageId) return null;
    const page = await this.repo.getPageContent(item.pageId);
    const content = isDocumentContent(page?.content) ? page.content : undefined;

    if (item.kind === FolderImportEntryKind.Document) {
      return content ? { pageId: item.pageId, content } : null;
    }
    if (!item.attachmentId) return null;
    const attachment = await this.repo.getAttachment(item.attachmentId);
    if (!attachment) return null;
    const node = buildFolderImportAttachmentNode({
      ...attachment,
      kind: item.kind as FolderImportEntryKind,
    });
    return {
      pageId: item.pageId,
      attachmentId: item.attachmentId,
      node,
      content,
    };
  }

  private getDirectories(metadata: unknown, items: FolderImportItem[]) {
    const fromMetadata = (metadata as any)?.directories;
    if (Array.isArray(fromMetadata)) return fromMetadata as string[];

    const directories = new Set<string>();
    for (const item of items) {
      const segments = item.relativePath.split('/');
      segments.pop();
      for (let index = 1; index <= segments.length; index++) {
        directories.add(segments.slice(0, index).join('/'));
      }
    }
    return [...directories].sort((left, right) => {
      const depth = left.split('/').length - right.split('/').length;
      return depth || left.localeCompare(right, 'pt-BR', { numeric: true });
    });
  }
}

function getParentDirectory(relativePath: string) {
  const directory = path.posix.dirname(relativePath);
  return directory === '.' ? '' : directory;
}

function extensionForMimeType(mimeType: string) {
  const extensions: Record<string, string> = {
    'image/gif': '.gif',
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/svg+xml': '.svg',
    'image/webp': '.webp',
  };
  return extensions[mimeType] ?? '.bin';
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown folder import error';
}

function extractText(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const node = content as { text?: string; content?: unknown[] };
  return [node.text ?? '', ...(node.content ?? []).map(extractText)]
    .filter(Boolean)
    .join(' ');
}

function isDocumentContent(
  content: unknown,
): content is Record<string, unknown> {
  return Boolean(
    content &&
    typeof content === 'object' &&
    (content as { type?: unknown }).type === 'doc',
  );
}

function getDocumentNodes(content: unknown): Record<string, unknown>[] {
  if (!isDocumentContent(content)) return [];
  const nodes = content.content;
  return Array.isArray(nodes)
    ? nodes.filter(
        (node): node is Record<string, unknown> =>
          Boolean(node) && typeof node === 'object',
      )
    : [];
}
