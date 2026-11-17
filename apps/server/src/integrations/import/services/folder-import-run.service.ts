import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { InjectKysely } from 'nestjs-kysely';
import { Selectable } from 'kysely';
import { FileTaskItems, FileTasks } from '../../../database/types/db';
import { KyselyDB } from '../../../database/types/kysely.types';
import { QueueJob, QueueName } from '../../queue/constants';
import { StorageService } from '../../storage/storage.service';
import {
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';
import { FolderImportProcessingService } from './folder-import-processing.service';

type FolderImportTask = Selectable<FileTasks>;
type FolderImportItem = Selectable<FileTaskItems>;

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

export function buildFolderImportReport(
  items: Pick<FolderImportItem, 'status' | 'duplicateOfId'>[],
): FolderImportReport {
  const report: FolderImportReport = {
    total: items.length,
    pending: 0,
    uploaded: 0,
    processing: 0,
    imported: 0,
    failed: 0,
    ignored: 0,
    duplicates: 0,
  };

  for (const item of items) {
    if (
      item.duplicateOfId &&
      [
        FolderImportItemStatus.Duplicate,
        FolderImportItemStatus.Success,
      ].includes(item.status as FolderImportItemStatus)
    ) {
      report.duplicates++;
    } else if (item.status === FolderImportItemStatus.Pending) {
      report.pending++;
    } else if (item.status === FolderImportItemStatus.Uploaded) {
      report.uploaded++;
    } else if (item.status === FolderImportItemStatus.Processing) {
      report.processing++;
    } else if (item.status === FolderImportItemStatus.Success) {
      report.imported++;
    } else if (item.status === FolderImportItemStatus.Failed) {
      report.failed++;
    } else if (item.status === FolderImportItemStatus.Ignored) {
      report.ignored++;
    }
  }

  return report;
}

@Injectable()
export class FolderImportRunRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async getSession(sessionId: string, workspaceId?: string) {
    let query = this.db
      .selectFrom('fileTasks')
      .selectAll()
      .where('id', '=', sessionId)
      .where('source', '=', 'folder')
      .where('deletedAt', 'is', null);
    if (workspaceId) query = query.where('workspaceId', '=', workspaceId);
    const session = await query.executeTakeFirst();
    if (!session)
      throw new NotFoundException('Folder import session not found');
    return session;
  }

  async getItems(sessionId: string) {
    return this.db
      .selectFrom('fileTaskItems')
      .selectAll()
      .where('fileTaskId', '=', sessionId)
      .orderBy('relativePath', 'asc')
      .execute();
  }

  async setStatus(
    sessionId: string,
    status: FolderImportSessionStatus,
    errorMessage: string | null = null,
  ) {
    return this.db
      .updateTable('fileTasks')
      .set({ status, errorMessage, updatedAt: new Date() })
      .where('id', '=', sessionId)
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  async failInterruptedItems(sessionId: string, errorMessage: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({
        status: FolderImportItemStatus.Failed,
        errorMessage: errorMessage.slice(0, 2_000),
        updatedAt: new Date(),
      })
      .where('fileTaskId', '=', sessionId)
      .where('status', '=', FolderImportItemStatus.Processing)
      .execute();
  }

  async clearStoragePath(itemId: string) {
    await this.db
      .updateTable('fileTaskItems')
      .set({ storagePath: null, updatedAt: new Date() })
      .where('id', '=', itemId)
      .execute();
  }
}

@Injectable()
export class FolderImportRunService {
  private readonly logger = new Logger(FolderImportRunService.name);

  constructor(
    private readonly repo: FolderImportRunRepo,
    private readonly processingService: FolderImportProcessingService,
    private readonly storageService: StorageService,
    @InjectQueue(QueueName.FILE_TASK_QUEUE)
    private readonly fileTaskQueue: Queue,
  ) {}

  async start(sessionId: string, workspaceId: string) {
    const session = await this.repo.getSession(sessionId, workspaceId);
    const items = await this.repo.getItems(sessionId);
    const report = buildFolderImportReport(items);

    if (session.status === FolderImportSessionStatus.Success) {
      return { session, report };
    }
    if (session.status === FolderImportSessionStatus.Processing) {
      return { session, report };
    }
    if (session.status === FolderImportSessionStatus.Cancelled) {
      throw new ConflictException(
        'Cancelled folder imports cannot be restarted',
      );
    }
    if (report.pending > 0) {
      throw new BadRequestException(
        `${report.pending} folder import files still need to be uploaded`,
      );
    }
    if (report.total === report.ignored) {
      throw new BadRequestException('Folder import has no importable files');
    }

    const previousStatus = session.status as FolderImportSessionStatus;
    const processingSession = await this.repo.setStatus(
      sessionId,
      FolderImportSessionStatus.Processing,
    );
    try {
      await this.fileTaskQueue.add(
        QueueJob.FOLDER_IMPORT_TASK,
        { fileTaskId: sessionId },
        { jobId: folderImportJobId(sessionId) },
      );
    } catch (error) {
      await this.repo.setStatus(
        sessionId,
        previousStatus,
        getErrorMessage(error),
      );
      throw error;
    }
    return { session: processingSession, report };
  }

  async run(sessionId: string) {
    const session = await this.repo.getSession(sessionId);
    if (session.status === FolderImportSessionStatus.Cancelled) {
      await this.cleanupUploadedFiles(sessionId, true);
      return this.getResult(session);
    }

    await this.processingService.processSession(sessionId);
    const currentSession = await this.repo.getSession(sessionId);
    if (currentSession.status === FolderImportSessionStatus.Cancelled) {
      await this.cleanupUploadedFiles(sessionId, true);
      return this.getResult(currentSession);
    }

    const items = await this.repo.getItems(sessionId);
    const report = buildFolderImportReport(items);
    const status = finalStatus(report);
    const completedSession = await this.repo.setStatus(
      sessionId,
      status,
      report.failed ? `${report.failed} file(s) failed to import` : null,
    );
    await this.cleanupUploadedFiles(sessionId, false);
    return { session: completedSession, report };
  }

  async cancel(sessionId: string, workspaceId: string) {
    const session = await this.repo.getSession(sessionId, workspaceId);
    if (session.status === FolderImportSessionStatus.Success) {
      throw new ConflictException(
        'Completed folder imports cannot be cancelled',
      );
    }
    if (session.status === FolderImportSessionStatus.Cancelled) {
      return this.getResult(session);
    }

    const cancelledSession = await this.repo.setStatus(
      sessionId,
      FolderImportSessionStatus.Cancelled,
    );
    const job = await this.fileTaskQueue.getJob(folderImportJobId(sessionId));
    const jobState = await job?.getState();
    if (job && jobState !== 'active') await job.remove();
    if (jobState !== 'active') await this.cleanupUploadedFiles(sessionId, true);
    return this.getResult(cancelledSession);
  }

  async handleJobFailure(sessionId: string, error: unknown) {
    const session = await this.repo.getSession(sessionId);
    if (session.status === FolderImportSessionStatus.Cancelled) return;
    const message = getErrorMessage(error);
    await this.repo.failInterruptedItems(sessionId, message);
    const items = await this.repo.getItems(sessionId);
    const report = buildFolderImportReport(items);
    const status =
      report.imported > 0 || report.duplicates > 0
        ? FolderImportSessionStatus.Partial
        : FolderImportSessionStatus.Failed;
    await this.repo.setStatus(sessionId, status, message);
  }

  async getResult(session: FolderImportTask) {
    const report = buildFolderImportReport(
      await this.repo.getItems(session.id),
    );
    return { session, report };
  }

  private async cleanupUploadedFiles(
    sessionId: string,
    includeUnfinished: boolean,
  ) {
    const items = await this.repo.getItems(sessionId);
    const candidates = items.filter(
      (item) =>
        item.storagePath &&
        (includeUnfinished || item.status === FolderImportItemStatus.Success),
    );
    for (const item of candidates) {
      try {
        await this.storageService.delete(item.storagePath!);
        await this.repo.clearStoragePath(item.id);
      } catch (error) {
        this.logger.warn(
          `Failed to clean folder import upload ${item.id}: ${getErrorMessage(error)}`,
        );
      }
    }
  }
}

function finalStatus(report: FolderImportReport) {
  if (report.failed > 0) {
    return report.imported > 0 || report.duplicates > 0
      ? FolderImportSessionStatus.Partial
      : FolderImportSessionStatus.Failed;
  }
  if (report.pending > 0 || report.uploaded > 0 || report.processing > 0) {
    return FolderImportSessionStatus.Processing;
  }
  return FolderImportSessionStatus.Success;
}

function folderImportJobId(sessionId: string) {
  return `folder-import-${sessionId}`;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'Unknown folder import error';
}
