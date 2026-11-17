import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';
import {
  buildFolderImportReport,
  FolderImportRunService,
} from './folder-import-run.service';

describe('folder import run lifecycle', () => {
  it('reconciles imported, ignored, duplicate and failed items', () => {
    expect(
      buildFolderImportReport([
        item(FolderImportItemStatus.Success),
        item(FolderImportItemStatus.Ignored),
        item(FolderImportItemStatus.Success, 'canonical-id'),
        item(FolderImportItemStatus.Failed),
      ]),
    ).toEqual({
      total: 4,
      pending: 0,
      uploaded: 0,
      processing: 0,
      imported: 1,
      failed: 1,
      ignored: 1,
      duplicates: 1,
    });
  });

  it('does not start while canonical files are pending upload', async () => {
    const { service } = setup({
      items: [item(FolderImportItemStatus.Pending)],
    });

    await expect(service.start('session-id', 'workspace-id')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('queues, processes and reports a partial session without deleting failures', async () => {
    const uploaded = item(FolderImportItemStatus.Uploaded, null, {
      id: 'uploaded',
      storagePath: 'folder/uploaded',
    });
    const broken = item(FolderImportItemStatus.Uploaded, null, {
      id: 'broken',
      storagePath: 'folder/broken',
    });
    const { service, queue, processingService, storageService, session } =
      setup({
        items: [uploaded, broken],
        process: async () => {
          uploaded.status = FolderImportItemStatus.Success;
          broken.status = FolderImportItemStatus.Failed;
        },
      });

    const started = await service.start('session-id', 'workspace-id');
    expect(started.session.status).toBe(FolderImportSessionStatus.Processing);
    expect(queue.add).toHaveBeenCalledWith(
      'folder-import-task',
      { fileTaskId: 'session-id' },
      { jobId: 'folder-import-session-id' },
    );

    const result = await service.run('session-id');

    expect(processingService.processSession).toHaveBeenCalledWith('session-id');
    expect(result.session.status).toBe(FolderImportSessionStatus.Partial);
    expect(result.report.failed).toBe(1);
    expect(storageService.delete).toHaveBeenCalledWith('folder/uploaded');
    expect(storageService.delete).not.toHaveBeenCalledWith('folder/broken');
    expect(session.errorMessage).toContain('1 file(s) failed');
  });

  it('allows retrying a partial session and keeps start idempotent while running', async () => {
    const failed = item(FolderImportItemStatus.Failed);
    const { service, queue, session } = setup({
      status: FolderImportSessionStatus.Partial,
      items: [failed],
    });

    await service.start('session-id', 'workspace-id');
    await service.start('session-id', 'workspace-id');

    expect(session.status).toBe(FolderImportSessionStatus.Processing);
    expect(queue.add).toHaveBeenCalledTimes(1);
  });

  it('cancels a waiting job, cleans uploads and cannot restart it', async () => {
    const uploaded = item(FolderImportItemStatus.Uploaded, null, {
      storagePath: 'folder/file',
    });
    const remove = jest.fn();
    const { service, storageService } = setup({
      items: [uploaded],
      job: { getState: jest.fn().mockResolvedValue('waiting'), remove },
    });

    const result = await service.cancel('session-id', 'workspace-id');

    expect(result.session.status).toBe(FolderImportSessionStatus.Cancelled);
    expect(remove).toHaveBeenCalled();
    expect(storageService.delete).toHaveBeenCalledWith('folder/file');
    await expect(service.start('session-id', 'workspace-id')).rejects.toThrow(
      ConflictException,
    );
  });

  it('marks a worker-level failure as retryable even before an item starts', async () => {
    const { service, session, repo } = setup({
      status: FolderImportSessionStatus.Processing,
      items: [item(FolderImportItemStatus.Uploaded)],
    });

    await service.handleJobFailure('session-id', new Error('worker stopped'));

    expect(repo.failInterruptedItems).toHaveBeenCalledWith(
      'session-id',
      'worker stopped',
    );
    expect(session.status).toBe(FolderImportSessionStatus.Failed);
    expect(session.errorMessage).toBe('worker stopped');
  });
});

function setup(options?: {
  status?: FolderImportSessionStatus;
  items?: any[];
  process?: () => Promise<void>;
  job?: any;
}) {
  const session = {
    id: 'session-id',
    workspaceId: 'workspace-id',
    source: 'folder',
    status: options?.status ?? FolderImportSessionStatus.Uploading,
    errorMessage: null as string | null,
  };
  const items = options?.items ?? [];
  const repo = {
    getSession: jest.fn().mockImplementation(async () => session),
    getItems: jest.fn().mockImplementation(async () => items),
    setStatus: jest
      .fn()
      .mockImplementation(async (_id, status, error = null) => {
        session.status = status;
        session.errorMessage = error;
        return session;
      }),
    failInterruptedItems: jest.fn(),
    clearStoragePath: jest.fn().mockImplementation(async (id) => {
      items.find((entry) => entry.id === id)!.storagePath = null;
    }),
  };
  const processingService = {
    processSession: jest
      .fn()
      .mockImplementation(options?.process ?? (async () => undefined)),
  };
  const storageService = { delete: jest.fn() };
  const queue = {
    add: jest.fn(),
    getJob: jest.fn().mockResolvedValue(options?.job ?? null),
  };
  return {
    service: new FolderImportRunService(
      repo as never,
      processingService as never,
      storageService as never,
      queue as never,
    ),
    repo,
    processingService,
    storageService,
    queue,
    session,
    items,
  };
}

function item(
  status: FolderImportItemStatus,
  duplicateOfId: string | null = null,
  overrides: Record<string, unknown> = {},
) {
  return {
    id: `item-${Math.random()}`,
    status,
    duplicateOfId,
    storagePath: null,
    ...overrides,
  };
}
