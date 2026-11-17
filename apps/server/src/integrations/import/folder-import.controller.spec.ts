import { ForbiddenException } from '@nestjs/common';
import { FolderImportController } from './folder-import.controller';

describe('FolderImportController', () => {
  const user = { id: 'user-id' } as never;
  const workspace = { id: 'workspace-id' } as never;
  const createDto = {
    spaceId: '6d582275-4d8b-4e20-9fc5-29e621266e28',
    rootName: 'Endomarketing',
    entries: [
      {
        relativePath: 'Eventos/comunicado.docx',
        fileSize: 100,
        sha256: 'a'.repeat(64),
      },
    ],
  };

  function setup(canEdit = true) {
    const session = {
      id: '019bf5c1-2175-7000-8000-000000000001',
      spaceId: createDto.spaceId,
      workspaceId: 'workspace-id',
    };
    const folderImportSessionService = {
      createSession: jest.fn().mockResolvedValue(session),
      getSessionTask: jest.fn().mockResolvedValue(session),
      getSession: jest.fn().mockResolvedValue({
        session,
        items: [],
        pagination: { limit: 50, nextCursor: null },
      }),
    };
    const spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({
        cannot: jest.fn().mockReturnValue(!canEdit),
      }),
    };
    const folderImportUploadService = {
      uploadItem: jest.fn().mockResolvedValue({ status: 'uploaded' }),
    };
    const folderImportRunService = {
      getResult: jest.fn().mockResolvedValue({ report: { total: 1 } }),
      start: jest.fn().mockResolvedValue({ status: 'processing' }),
      cancel: jest.fn().mockResolvedValue({ status: 'cancelled' }),
    };
    const controller = new FolderImportController(
      folderImportSessionService as never,
      spaceAbility as never,
      folderImportUploadService as never,
      folderImportRunService as never,
    );

    return {
      controller,
      folderImportSessionService,
      folderImportUploadService,
      folderImportRunService,
      spaceAbility,
      session,
    };
  }

  it('creates a reconciled session for an editable space', async () => {
    const { controller, folderImportSessionService, session } = setup();

    const result = await controller.create(createDto, user, workspace);

    expect(result.session).toBe(session);
    expect(result.manifest.summary).toMatchObject({
      totalEntries: 1,
      importableEntries: 1,
      effectiveBytes: 100,
    });
    expect(folderImportSessionService.createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        rootName: 'Endomarketing',
        creatorId: 'user-id',
        spaceId: createDto.spaceId,
        workspaceId: 'workspace-id',
      }),
    );
  });

  it('rejects creation when the user cannot edit pages in the space', async () => {
    const { controller, folderImportSessionService } = setup(false);

    await expect(controller.create(createDto, user, workspace)).rejects.toThrow(
      ForbiddenException,
    );
    expect(folderImportSessionService.createSession).not.toHaveBeenCalled();
  });

  it('returns a paginated session only after checking its space permission', async () => {
    const { controller, folderImportSessionService, spaceAbility } = setup();

    const result = await controller.get(
      '019bf5c1-2175-7000-8000-000000000001',
      { limit: 50 },
      user,
      workspace,
    );

    expect(folderImportSessionService.getSession).toHaveBeenCalledWith(
      '019bf5c1-2175-7000-8000-000000000001',
      'workspace-id',
      { limit: 50 },
    );
    expect(spaceAbility.createForUser).toHaveBeenCalledWith(
      user,
      createDto.spaceId,
    );
    expect(result.session.workspaceId).toBe('workspace-id');
    expect(result.report).toEqual({ total: 1 });
  });

  it('checks permission before starting, retrying or cancelling', async () => {
    const { controller, folderImportRunService } = setup();
    const sessionId = '019bf5c1-2175-7000-8000-000000000001';

    await controller.start(sessionId, user, workspace);
    await controller.retry(sessionId, user, workspace);
    await controller.cancel(sessionId, user, workspace);

    expect(folderImportRunService.start).toHaveBeenCalledTimes(2);
    expect(folderImportRunService.start).toHaveBeenCalledWith(
      sessionId,
      'workspace-id',
    );
    expect(folderImportRunService.cancel).toHaveBeenCalledWith(
      sessionId,
      'workspace-id',
    );
  });

  it('checks permission before forwarding an item upload', async () => {
    const { controller, folderImportUploadService } = setup();
    const file = { filename: 'comunicado.docx' };
    const req = { file: jest.fn().mockResolvedValue(file) };

    await controller.uploadItem(
      '019bf5c1-2175-7000-8000-000000000001',
      '019bf5c1-2175-7000-8000-000000000002',
      req,
      user,
      workspace,
    );

    expect(req.file).toHaveBeenCalledWith(
      expect.objectContaining({
        limits: expect.objectContaining({ files: 1 }),
      }),
    );
    expect(folderImportUploadService.uploadItem).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: '019bf5c1-2175-7000-8000-000000000001',
        itemId: '019bf5c1-2175-7000-8000-000000000002',
        workspaceId: 'workspace-id',
      }),
    );
  });

  it('does not read upload bytes when the user cannot edit the space', async () => {
    const { controller, folderImportUploadService } = setup(false);
    const req = { file: jest.fn() };

    await expect(
      controller.uploadItem(
        '019bf5c1-2175-7000-8000-000000000001',
        '019bf5c1-2175-7000-8000-000000000002',
        req,
        user,
        workspace,
      ),
    ).rejects.toThrow(ForbiddenException);
    expect(req.file).not.toHaveBeenCalled();
    expect(folderImportUploadService.uploadItem).not.toHaveBeenCalled();
  });
});
