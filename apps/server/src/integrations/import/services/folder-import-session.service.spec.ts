import { buildFolderImportManifest } from '../utils/folder-import-manifest';
import {
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';
import { FolderImportSessionService } from './folder-import-session.service';

jest.mock('../../../database/utils', () => ({
  executeTx: async (_db: unknown, callback: (trx: unknown) => unknown) =>
    callback(_db),
}));

describe('FolderImportSessionService', () => {
  it('persists a folder task and reconciled items without file contents', async () => {
    const inserted: Record<string, Record<string, unknown>[]> = {
      fileTasks: [],
      fileTaskItems: [],
    };
    const db = {
      insertInto: (table: keyof typeof inserted) => ({
        values: (
          values: Record<string, unknown> | Record<string, unknown>[],
        ) => {
          const rows = Array.isArray(values) ? values : [values];
          inserted[table].push(...rows);
          return {
            execute: async () => undefined,
            returningAll: () => ({
              executeTakeFirstOrThrow: async () => inserted[table][0],
            }),
          };
        },
      }),
    };
    const service = new FolderImportSessionService(db as never);
    const manifest = buildFolderImportManifest([
      {
        relativePath: 'Evento/foto.jpg',
        fileSize: 100,
        mimeType: 'image/jpeg',
        sha256: 'a'.repeat(64),
      },
      {
        relativePath: 'Evento/copia.jpg',
        fileSize: 100,
        mimeType: 'image/jpeg',
        sha256: 'a'.repeat(64),
      },
      { relativePath: 'Evento/.DS_Store', fileSize: 10 },
    ]);

    const session = await service.createSession({
      rootName: 'Endomarketing',
      manifest,
      creatorId: 'user-id',
      spaceId: 'space-id',
      workspaceId: 'workspace-id',
    });

    expect(session).toMatchObject({
      type: 'import',
      source: 'folder',
      status: FolderImportSessionStatus.Uploading,
      fileName: 'Endomarketing',
      creatorId: 'user-id',
      spaceId: 'space-id',
      workspaceId: 'workspace-id',
      metadata: {
        rootName: 'Endomarketing',
        directories: ['Evento'],
        summary: manifest.summary,
      },
    });
    expect(inserted.fileTaskItems).toHaveLength(3);
    expect(inserted.fileTaskItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          relativePath: 'Evento/foto.jpg',
          status: FolderImportItemStatus.Pending,
          duplicateOfId: null,
        }),
        expect.objectContaining({
          relativePath: 'Evento/copia.jpg',
          status: FolderImportItemStatus.Duplicate,
          duplicateOfId: expect.any(String),
        }),
        expect.objectContaining({
          relativePath: 'Evento/.DS_Store',
          status: FolderImportItemStatus.Ignored,
          sha256: null,
        }),
      ]),
    );
  });
});
