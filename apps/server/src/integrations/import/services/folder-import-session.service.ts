import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { Insertable, Selectable } from 'kysely';
import { v7 as uuid7 } from 'uuid';
import { executeTx } from '../../../database/utils';
import { executeWithCursorPagination } from '../../../database/pagination/cursor-pagination';
import { FileTaskItems, FileTasks, Json } from '../../../database/types/db';
import { KyselyDB } from '../../../database/types/kysely.types';
import {
  CreateFolderImportSessionInput,
  FolderImportEntryKind,
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';
import { FileTaskType, getFileTaskFolderPath } from '../utils/file.utils';
import { GetFolderImportDto } from '../dto/folder-import-api.dto';

const ITEM_INSERT_BATCH_SIZE = 250;

type FolderImportTask = Selectable<FileTasks>;
type NewFolderImportItem = Insertable<FileTaskItems>;

function chunksOf<T>(values: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < values.length; index += chunkSize) {
    chunks.push(values.slice(index, index + chunkSize));
  }
  return chunks;
}

@Injectable()
export class FolderImportSessionService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async createSession(
    input: CreateFolderImportSessionInput,
  ): Promise<FolderImportTask> {
    const sessionId = uuid7();
    const itemIdByPath = new Map<string, string>();

    for (const entry of input.manifest.entries) {
      itemIdByPath.set(entry.relativePath, uuid7());
    }

    const items: NewFolderImportItem[] = input.manifest.entries.map(
      (entry) => ({
        id: itemIdByPath.get(entry.relativePath)!,
        fileTaskId: sessionId,
        relativePath: entry.relativePath,
        fileName: entry.fileName,
        kind: entry.kind,
        status:
          entry.kind === FolderImportEntryKind.Ignored
            ? FolderImportItemStatus.Ignored
            : entry.duplicateOfPath
              ? FolderImportItemStatus.Duplicate
              : FolderImportItemStatus.Pending,
        mimeType: entry.mimeType ?? null,
        fileSize: entry.fileSize,
        sha256: entry.sha256,
        storagePath: null,
        duplicateOfId: entry.duplicateOfPath
          ? itemIdByPath.get(entry.duplicateOfPath)!
          : null,
        pageId: null,
        attachmentId: null,
        errorMessage: null,
      }),
    );

    const metadata: Json = {
      rootName: input.rootName.normalize('NFC').trim(),
      directories: input.manifest.directories,
      summary: { ...input.manifest.summary },
    };
    const filePath = `${getFileTaskFolderPath(
      FileTaskType.Import,
      input.workspaceId,
    )}/${sessionId}/folder`;

    return executeTx(this.db, async (trx) => {
      const session = await trx
        .insertInto('fileTasks')
        .values({
          id: sessionId,
          type: FileTaskType.Import,
          source: 'folder',
          status: FolderImportSessionStatus.Uploading,
          fileName: input.rootName.normalize('NFC').trim(),
          filePath,
          fileSize: input.manifest.summary.effectiveBytes,
          fileExt: null,
          errorMessage: null,
          creatorId: input.creatorId,
          spaceId: input.spaceId,
          workspaceId: input.workspaceId,
          metadata,
          pageId: null,
          deletedAt: null,
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      for (const itemBatch of chunksOf(items, ITEM_INSERT_BATCH_SIZE)) {
        await trx.insertInto('fileTaskItems').values(itemBatch).execute();
      }

      return session;
    });
  }

  async getSession(
    sessionId: string,
    workspaceId: string,
    pagination: GetFolderImportDto,
  ) {
    const session = await this.getSessionTask(sessionId, workspaceId);

    const itemQuery = this.db
      .selectFrom('fileTaskItems')
      .selectAll()
      .where('fileTaskId', '=', sessionId);
    const result = await executeWithCursorPagination(itemQuery, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'id', direction: 'asc' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });

    return {
      session,
      items: result.items,
      pagination: result.meta,
    };
  }

  async getSessionTask(sessionId: string, workspaceId: string) {
    const session = await this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', sessionId)
      .where('workspaceId', '=', workspaceId)
      .where('source', '=', 'folder')
      .where('deletedAt', 'is', null)
      .executeTakeFirst();

    if (!session) {
      throw new NotFoundException('Folder import session not found');
    }
    return session;
  }
}
