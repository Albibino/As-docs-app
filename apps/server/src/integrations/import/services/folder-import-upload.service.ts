import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { createHash } from 'crypto';
import { Readable } from 'stream';
import { v7 as uuid7 } from 'uuid';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '../../../database/types/kysely.types';
import { StorageService } from '../../storage/storage.service';
import { FolderImportItemStatus } from '../dto/folder-import.dto';
import { FolderImportSessionStatus } from '../dto/folder-import.dto';

interface UploadFolderImportItemInput {
  sessionId: string;
  itemId: string;
  workspaceId: string;
  filePromise: Promise<MultipartFile>;
}

@Injectable()
export class FolderImportItemRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findUploadTarget(
    sessionId: string,
    itemId: string,
    workspaceId: string,
  ) {
    const target = await this.db
      .selectFrom('fileTaskItems as item')
      .innerJoin('fileTasks as task', 'task.id', 'item.fileTaskId')
      .select([
        'item.id',
        'item.fileTaskId',
        'item.fileName',
        'item.fileSize',
        'item.sha256',
        'item.status',
        'item.storagePath',
        'task.filePath as taskFilePath',
        'task.status as taskStatus',
      ])
      .where('item.id', '=', itemId)
      .where('item.fileTaskId', '=', sessionId)
      .where('task.workspaceId', '=', workspaceId)
      .where('task.source', '=', 'folder')
      .where('task.deletedAt', 'is', null)
      .executeTakeFirst();

    if (!target) {
      throw new NotFoundException('Folder import item not found');
    }
    return target;
  }

  async markUploaded(itemId: string, storagePath: string) {
    return this.db
      .updateTable('fileTaskItems')
      .set({
        status: FolderImportItemStatus.Uploaded,
        storagePath,
        errorMessage: null,
        updatedAt: new Date(),
      })
      .where('id', '=', itemId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }
}

@Injectable()
export class FolderImportUploadService {
  constructor(
    private readonly itemRepo: FolderImportItemRepo,
    private readonly storageService: StorageService,
  ) {}

  async uploadItem(input: UploadFolderImportItemInput) {
    const target = await this.itemRepo.findUploadTarget(
      input.sessionId,
      input.itemId,
      input.workspaceId,
    );

    const isRetry = target.status === FolderImportItemStatus.Uploaded;
    if (target.taskStatus !== FolderImportSessionStatus.Uploading) {
      throw new ConflictException(
        `Folder import cannot receive uploads while ${target.taskStatus}`,
      );
    }
    if (!isRetry && target.status !== FolderImportItemStatus.Pending) {
      throw new ConflictException(
        `Folder import item cannot be uploaded while ${target.status}`,
      );
    }
    if (!target.sha256) {
      throw new ConflictException('Folder import item has no content hash');
    }

    const file = await input.filePromise;
    const stagingPath = `${target.taskFilePath}/staging/${target.id}/${uuid7()}`;
    const canonicalPath = `${target.taskFilePath}/items/${target.id}/${target.fileName}`;
    const hash = createHash('sha256');
    let fileSize = 0;
    let copiedToCanonical = false;
    let persisted = false;

    async function* hashedChunks(source: Readable) {
      for await (const chunk of source) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        fileSize += buffer.length;
        hash.update(buffer);
        yield buffer;
      }
    }

    try {
      await this.storageService.upload(
        stagingPath,
        Readable.from(hashedChunks(file.file)),
      );

      const uploadedHash = hash.digest('hex');
      if (
        fileSize !== Number(target.fileSize) ||
        uploadedHash !== target.sha256
      ) {
        throw new UnprocessableEntityException(
          'Uploaded file does not match the folder manifest',
        );
      }

      if (isRetry) {
        return target;
      }

      await this.storageService.copy(stagingPath, canonicalPath);
      copiedToCanonical = true;
      const updatedItem = await this.itemRepo.markUploaded(
        target.id,
        canonicalPath,
      );
      persisted = true;
      return updatedItem;
    } finally {
      await this.deleteQuietly(stagingPath);
      if (copiedToCanonical && !persisted) {
        await this.deleteQuietly(canonicalPath);
      }
    }
  }

  private async deleteQuietly(filePath: string) {
    try {
      await this.storageService.delete(filePath);
    } catch {
      // Cleanup is best effort. The session prefix remains available to a
      // scheduled cleanup without hiding the original upload error.
    }
  }
}
