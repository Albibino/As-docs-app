import { Document, ImageRun, Packer, Paragraph, TextRun } from 'docx';
import { Readable } from 'stream';
import {
  FolderImportEntryKind,
  FolderImportItemStatus,
} from '../dto/folder-import.dto';
import {
  buildFolderImportAttachmentNode,
  FolderImportProcessingService,
} from './folder-import-processing.service';

describe('FolderImportProcessingService', () => {
  it.each([
    ['foto.jpg', FolderImportEntryKind.Image, 'image'],
    ['video.mp4', FolderImportEntryKind.Video, 'video'],
    ['calendario.pdf', FolderImportEntryKind.Pdf, 'pdf'],
    ['original.heic', FolderImportEntryKind.Image, 'attachment'],
    ['planilha.xlsx', FolderImportEntryKind.Attachment, 'attachment'],
  ])('maps %s to a %s editor node', (fileName, kind, expectedType) => {
    expect(
      buildFolderImportAttachmentNode({
        id: 'attachment-id',
        fileName,
        fileSize: '123',
        mimeType: 'application/octet-stream',
        kind,
      }).type,
    ).toBe(expectedType);
  });

  it('preserves hierarchy, converts DOCX and reuses duplicate media', async () => {
    const docxBuffer = await Packer.toBuffer(
      new Document({
        sections: [
          {
            children: [
              new Paragraph({
                children: [
                  new TextRun('Detalhamento da ação'),
                  new ImageRun({
                    data: Buffer.from(
                      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c8B8AAAAASUVORK5CYII=',
                      'base64',
                    ),
                    transformation: { width: 1, height: 1 },
                  }),
                ],
              }),
            ],
          },
        ],
      }),
    );
    const items = [
      item({
        id: 'docx-item',
        relativePath: 'Eventos 2025/12 - Natal/Detalhes.doc.docx',
        kind: FolderImportEntryKind.Document,
        storagePath: 'stored/docx',
      }),
      item({
        id: 'image-item',
        relativePath: 'Eventos 2025/12 - Natal/foto.jpg',
        kind: FolderImportEntryKind.Image,
        storagePath: 'stored/image',
      }),
      item({
        id: 'duplicate-item',
        relativePath: 'Eventos 2025/12 - Natal/foto copia.jpg',
        kind: FolderImportEntryKind.Image,
        status: FolderImportItemStatus.Duplicate,
        duplicateOfId: 'image-item',
        storagePath: null,
      }),
      item({
        id: 'pdf-item',
        relativePath: 'Eventos 2025/Calendario.pdf',
        kind: FolderImportEntryKind.Pdf,
        storagePath: 'stored/pdf',
      }),
      item({
        id: 'broken-item',
        relativePath: 'Eventos 2025/12 - Natal/quebrado.xlsx',
        kind: FolderImportEntryKind.Attachment,
        storagePath: 'stored/missing',
      }),
    ];
    const contentByPage = new Map<string, any>();
    const liveContentByPage = new Map<string, any>();
    const statusByItem = new Map<string, string>();
    const createdPages: Array<Record<string, any>> = [];
    const session = {
      id: 'session-id',
      fileName: 'Endomarketing',
      creatorId: 'user-id',
      spaceId: 'space-id',
      workspaceId: 'workspace-id',
      pageId: null,
      metadata: {
        directories: ['Eventos 2025', 'Eventos 2025/12 - Natal'],
      },
    };
    const sessionRepo = {
      getProcessingData: jest.fn().mockResolvedValue({
        session,
        items,
      }),
      isCancelled: jest.fn().mockResolvedValue(false),
      markProcessing: jest.fn().mockImplementation(async (id) => {
        statusByItem.set(id, FolderImportItemStatus.Processing);
      }),
      markSuccess: jest.fn().mockImplementation(async (id, result) => {
        statusByItem.set(id, FolderImportItemStatus.Success);
        Object.assign(items.find((entry) => entry.id === id)!, result, {
          status: FolderImportItemStatus.Success,
        });
      }),
      markFailed: jest.fn().mockImplementation(async (id) => {
        statusByItem.set(id, FolderImportItemStatus.Failed);
        items.find((entry) => entry.id === id)!.status =
          FolderImportItemStatus.Failed;
      }),
      updatePageContent: jest
        .fn()
        .mockImplementation(async (pageId, content) => {
          contentByPage.set(pageId, content);
        }),
      getPageContent: jest.fn().mockImplementation(async (pageId) => ({
        content: contentByPage.get(pageId) ?? null,
      })),
      getAttachment: jest.fn(),
      recordPage: jest.fn().mockImplementation(async (id, pageId) => {
        items.find((entry) => entry.id === id)!.pageId = pageId;
      }),
      recordAttachment: jest
        .fn()
        .mockImplementation(async (id, attachmentId) => {
          items.find((entry) => entry.id === id)!.attachmentId = attachmentId;
        }),
      recordRootPage: jest.fn(),
      recordDirectoryPage: jest
        .fn()
        .mockImplementation(async (_id, metadata, directory, pageId) => {
          const next = {
            ...metadata,
            directoryPageIds: {
              ...metadata.directoryPageIds,
              [directory]: pageId,
            },
          };
          session.metadata = next;
          return next;
        }),
    };
    const pageService = {
      create: jest.fn().mockImplementation(async (_user, _workspace, dto) => {
        const page = { id: `page-${createdPages.length + 1}`, ...dto };
        createdPages.push(page);
        liveContentByPage.set(page.id, {
          type: 'doc',
          content: [{ type: 'paragraph' }],
        });
        return page;
      }),
      updatePageContent: jest
        .fn()
        .mockImplementation(async (pageId, content) => {
          liveContentByPage.set(pageId, content);
        }),
    };
    const storageService = {
      read: jest.fn().mockImplementation(async (storagePath) => {
        if (storagePath === 'stored/docx') return docxBuffer;
        throw new Error('missing stored file');
      }),
      readStream: jest.fn().mockImplementation(async (storagePath) => {
        const stored = new Map([
          ['stored/image', Buffer.from('image')],
          ['stored/pdf', Buffer.from('pdf')],
        ]);
        const content = stored.get(storagePath);
        if (!content) throw new Error('missing stored file');
        return Readable.from(content);
      }),
    };
    let attachmentSequence = 0;
    const attachmentService = {
      uploadFile: jest.fn().mockImplementation(async ({ filePromise }) => {
        const file = await filePromise;
        for await (const _chunk of file.file) {
          // Consume the same stream used by the production attachment service.
        }
        attachmentSequence++;
        return {
          id: `attachment-${attachmentSequence}`,
          fileName: file.filename,
          fileSize: 5,
          mimeType: 'application/octet-stream',
        };
      }),
    };
    const importService = {
      processHTML: jest.fn().mockImplementation(async (html) => ({
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: html }],
          },
        ],
      })),
      processMarkdown: jest.fn(),
      createYdoc: jest.fn().mockResolvedValue(Buffer.from('ydoc')),
      extractTitleAndRemoveHeading: jest.fn().mockImplementation((content) => ({
        title: null,
        prosemirrorJson: content,
      })),
    };
    const service = new FolderImportProcessingService(
      sessionRepo as never,
      pageService as never,
      attachmentService as never,
      storageService as never,
      importService as never,
    );

    const result = await service.processSession('session-id');

    const yearPage = createdPages.find(
      (page) => page.title === 'Eventos 2025',
    )!;
    const natalPage = createdPages.find((page) => page.title === '12 - Natal')!;
    const docxPage = createdPages.find(
      (page) => page.parentPageId === natalPage.id,
    )!;
    expect(docxPage.title).toBe('Detalhes');
    const pdfPage = createdPages.find((page) => page.title === 'Calendario')!;
    expect(natalPage.parentPageId).toBe(yearPage.id);
    expect(docxPage.parentPageId).toBe(natalPage.id);
    expect(pdfPage.parentPageId).toBe(yearPage.id);
    expect(JSON.stringify(contentByPage.get(docxPage.id))).toContain(
      'Detalhamento da ação',
    );
    expect(JSON.stringify(liveContentByPage.get(docxPage.id))).toContain(
      'Detalhamento da ação',
    );
    expect(
      contentByPage
        .get(natalPage.id)
        .content.filter((node: any) => node.type === 'image'),
    ).toHaveLength(2);
    expect(attachmentService.uploadFile).toHaveBeenCalledTimes(3);
    const uploadedFileNames = await Promise.all(
      attachmentService.uploadFile.mock.calls.map(
        async ([{ filePromise }]) => (await filePromise).filename,
      ),
    );
    expect(uploadedFileNames).toContain('embedded-1.png');
    expect(statusByItem.get('duplicate-item')).toBe(
      FolderImportItemStatus.Success,
    );
    expect(statusByItem.get('broken-item')).toBe(FolderImportItemStatus.Failed);
    expect(result).toEqual({ processed: 4, failed: 1, cancelled: false });

    const createdPageCount = createdPages.length;
    const retry = await service.processSession('session-id');
    expect(createdPages).toHaveLength(createdPageCount);
    expect(
      contentByPage
        .get(natalPage.id)
        .content.filter((node: any) => node.type === 'image'),
    ).toHaveLength(2);
    expect(retry).toEqual({ processed: 0, failed: 1, cancelled: false });
  });
});

function item(overrides: Record<string, unknown>) {
  const relativePath = String(overrides.relativePath);
  return {
    id: 'item-id',
    fileTaskId: 'session-id',
    relativePath,
    fileName: relativePath.slice(relativePath.lastIndexOf('/') + 1),
    fileSize: '5',
    mimeType: 'application/octet-stream',
    sha256: 'a'.repeat(64),
    kind: FolderImportEntryKind.Attachment,
    status: FolderImportItemStatus.Uploaded,
    storagePath: 'stored/file',
    duplicateOfId: null,
    pageId: null,
    attachmentId: null,
    errorMessage: null,
    ...overrides,
  };
}
