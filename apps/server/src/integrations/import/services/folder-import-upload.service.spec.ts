import {
  ConflictException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Readable } from 'stream';
import {
  FolderImportItemStatus,
  FolderImportSessionStatus,
} from '../dto/folder-import.dto';
import { FolderImportUploadService } from './folder-import-upload.service';

describe('FolderImportUploadService', () => {
  const content = Buffer.from('conteudo da foto');
  const sha256 =
    'ebdce44b241437b06c6534d9f9b9a3c7e633cf7510de43021a6ca74b5ee1b525';

  function setup(status = FolderImportItemStatus.Pending) {
    const target = {
      id: 'item-id',
      fileTaskId: 'session-id',
      fileName: 'foto.jpg',
      fileSize: String(content.length),
      sha256,
      status,
      storagePath:
        status === FolderImportItemStatus.Uploaded
          ? 'workspace/imports/session/folder/items/item-id/foto.jpg'
          : null,
      taskFilePath: 'workspace/imports/session/folder',
      taskStatus:
        FolderImportSessionStatus.Uploading as FolderImportSessionStatus,
    };
    const files = new Map<string, Buffer>();
    if (target.storagePath)
      files.set(target.storagePath, Buffer.from('original'));

    const itemRepo = {
      findUploadTarget: jest.fn().mockResolvedValue(target),
      markUploaded: jest.fn().mockImplementation(async (_id, storagePath) => {
        target.status = FolderImportItemStatus.Uploaded;
        target.storagePath = storagePath;
        return target;
      }),
    };
    const storageService = {
      upload: jest.fn().mockImplementation(async (path, stream: Readable) => {
        const chunks: Buffer[] = [];
        for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        files.set(path, Buffer.concat(chunks));
      }),
      copy: jest.fn().mockImplementation(async (from, to) => {
        files.set(to, files.get(from)!);
      }),
      delete: jest.fn().mockImplementation(async (path) => {
        files.delete(path);
      }),
    };
    const service = new FolderImportUploadService(
      itemRepo as never,
      storageService as never,
    );

    return { service, target, files, itemRepo, storageService };
  }

  function multipartFile(buffer: Buffer) {
    return Promise.resolve({
      filename: 'foto.jpg',
      file: Readable.from(buffer),
    } as never);
  }

  it('stores a valid stream and marks the item as uploaded', async () => {
    const { service, target, files, itemRepo } = setup();

    const result = await service.uploadItem({
      sessionId: 'session-id',
      itemId: 'item-id',
      workspaceId: 'workspace-id',
      filePromise: multipartFile(content),
    });

    expect(result.status).toBe(FolderImportItemStatus.Uploaded);
    expect(files.get(target.storagePath!)).toEqual(content);
    expect(itemRepo.markUploaded).toHaveBeenCalledWith(
      'item-id',
      target.storagePath,
    );
  });

  it('deletes staged bytes and rejects content with a different hash', async () => {
    const { service, files, itemRepo } = setup();

    await expect(
      service.uploadItem({
        sessionId: 'session-id',
        itemId: 'item-id',
        workspaceId: 'workspace-id',
        filePromise: multipartFile(Buffer.from('conteudo adulterado')),
      }),
    ).rejects.toThrow(UnprocessableEntityException);

    expect(files.size).toBe(0);
    expect(itemRepo.markUploaded).not.toHaveBeenCalled();
  });

  it('validates a retry without overwriting an item already uploaded', async () => {
    const { service, target, files, storageService, itemRepo } = setup(
      FolderImportItemStatus.Uploaded,
    );

    const result = await service.uploadItem({
      sessionId: 'session-id',
      itemId: 'item-id',
      workspaceId: 'workspace-id',
      filePromise: multipartFile(content),
    });

    expect(result).toBe(target);
    expect(files.get(target.storagePath!)).toEqual(Buffer.from('original'));
    expect(storageService.copy).not.toHaveBeenCalled();
    expect(itemRepo.markUploaded).not.toHaveBeenCalled();
  });

  it.each([
    FolderImportItemStatus.Duplicate,
    FolderImportItemStatus.Ignored,
    FolderImportItemStatus.Processing,
  ])('rejects upload when the item status is %s', async (status) => {
    const { service, storageService } = setup(status);

    await expect(
      service.uploadItem({
        sessionId: 'session-id',
        itemId: 'item-id',
        workspaceId: 'workspace-id',
        filePromise: multipartFile(content),
      }),
    ).rejects.toThrow(ConflictException);
    expect(storageService.upload).not.toHaveBeenCalled();
  });

  it('rejects uploads after the session has started or been cancelled', async () => {
    const { service, target, storageService } = setup();
    target.taskStatus = FolderImportSessionStatus.Cancelled;

    await expect(
      service.uploadItem({
        sessionId: 'session-id',
        itemId: 'item-id',
        workspaceId: 'workspace-id',
        filePromise: multipartFile(content),
      }),
    ).rejects.toThrow(ConflictException);
    expect(storageService.upload).not.toHaveBeenCalled();
  });
});
