import { Test, TestingModule } from '@nestjs/testing';
import { PageController } from './page.controller';
import { PageService } from './services/page.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { GUARDS_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { RestorePageHistoryDto } from './dto/page.dto';

describe('PageController', () => {
  let controller: PageController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PageController],
      providers: [PageService],
    })
      .useMocker(() => ({}))
      .compile();

    controller = module.get<PageController>(PageController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('registers the approved authenticated manual-version route', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        PageController.prototype.saveManualVersion,
      ),
    ).toBe('/history/create-version');
    expect(Reflect.getMetadata(GUARDS_METADATA, PageController)).toContain(
      JwtAuthGuard,
    );
  });

  it('requires edit permission before saving a manual version from the editor payload', async () => {
    const page = { id: 'page-1' } as any;
    const pageRepo = (controller as any).pageRepo;
    const pageAccessService = (controller as any).pageAccessService;
    const pageHistoryService = (controller as any).pageHistoryService;
    pageRepo.findById = jest.fn().mockResolvedValue(page);
    pageAccessService.validateCanEdit = jest
      .fn()
      .mockRejectedValue(new Error('forbidden'));
    pageHistoryService.saveManualVersion = jest.fn();

    await expect(
      controller.saveManualVersion(
        {
          pageId: 'page-1',
          title: 'Versão',
          content: { type: 'doc', content: [] },
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toThrow('forbidden');

    expect(pageHistoryService.saveManualVersion).not.toHaveBeenCalled();
  });

  it('rejects saving a manual version for a missing page', async () => {
    const pageRepo = (controller as any).pageRepo;
    pageRepo.findById = jest.fn().mockResolvedValue(undefined);

    await expect(
      controller.saveManualVersion(
        {
          pageId: 'missing-page',
          title: 'Versão',
          content: { type: 'doc', content: [] },
        },
        { id: 'user-1' } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('registers the snapshot-before-restore route', () => {
    expect(
      Reflect.getMetadata(
        PATH_METADATA,
        PageController.prototype.snapshotBeforeRestore,
      ),
    ).toBe('/history/snapshot-before-restore');
  });

  it('validates the snapshot-before-restore payload contract', async () => {
    const validDto = plainToInstance(RestorePageHistoryDto, {
      pageId: 'page-1',
      historyId: '5e72127f-b9f6-4b26-9f35-ab3729a24b5b',
      title: 'Rascunho',
      content: { type: 'doc', content: [] },
      requestId: '71ae49da-e282-4ad5-93c5-9de6d9743b2a',
    });

    await expect(validate(validDto)).resolves.toHaveLength(0);

    const invalidDto = plainToInstance(RestorePageHistoryDto, {
      pageId: '',
      historyId: 'revision-1',
      title: 123,
      content: 'not-an-object',
      requestId: 'request-1',
    });
    const invalidProperties = (await validate(invalidDto)).map(
      ({ property }) => property,
    );

    expect(invalidProperties).toEqual(
      expect.arrayContaining([
        'pageId',
        'historyId',
        'title',
        'content',
        'requestId',
      ]),
    );
  });

  it('requires edit permission before preparing a restore', async () => {
    const page = {
      id: 'page-1',
      deletedAt: null,
      workspaceId: 'workspace-1',
    } as any;
    const pageRepo = (controller as any).pageRepo;
    const pageAccessService = (controller as any).pageAccessService;
    const pageHistoryService = (controller as any).pageHistoryService;
    pageRepo.findById = jest.fn().mockResolvedValue(page);
    pageAccessService.validateCanEdit = jest
      .fn()
      .mockRejectedValue(new Error('forbidden'));
    pageHistoryService.snapshotBeforeRestore = jest.fn();

    await expect(
      controller.snapshotBeforeRestore(
        {
          pageId: 'page-1',
          historyId: 'revision-1',
          title: 'Rascunho',
          content: { type: 'doc', content: [] },
        },
        { id: 'user-1' } as any,
        { id: 'workspace-1' } as any,
      ),
    ).rejects.toThrow('forbidden');

    expect(pageHistoryService.snapshotBeforeRestore).not.toHaveBeenCalled();
  });

  it.each([
    ['missing', undefined],
    [
      'deleted',
      {
        id: 'page-1',
        deletedAt: new Date(),
        workspaceId: 'workspace-1',
      },
    ],
    [
      'from another workspace',
      { id: 'page-1', deletedAt: null, workspaceId: 'workspace-2' },
    ],
  ])('rejects preparing a restore for a %s page', async (_case, page) => {
    const pageRepo = (controller as any).pageRepo;
    const pageAccessService = (controller as any).pageAccessService;
    pageRepo.findById = jest.fn().mockResolvedValue(page);
    pageAccessService.validateCanEdit = jest.fn();

    await expect(
      controller.snapshotBeforeRestore(
        {
          pageId: 'page-1',
          historyId: 'revision-1',
          title: 'Rascunho',
          content: { type: 'doc', content: [] },
        },
        { id: 'user-1' } as any,
        { id: 'workspace-1' } as any,
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(pageAccessService.validateCanEdit).not.toHaveBeenCalled();
  });

  it('delegates the live draft and forwards the optional restore token', async () => {
    const page = {
      id: 'page-1',
      deletedAt: null,
      workspaceId: 'workspace-1',
    } as any;
    const dto = {
      pageId: 'page-1',
      historyId: 'revision-1',
      title: 'Rascunho',
      content: { type: 'doc', content: [] },
      requestId: 'request-1',
    };
    const user = { id: 'user-1' } as any;
    const result = {
      snapshot: { id: 'snapshot-1' },
      targetRevisionId: 'revision-1',
      restoreToken: 'restore-token',
    };
    const pageRepo = (controller as any).pageRepo;
    const pageAccessService = (controller as any).pageAccessService;
    const pageHistoryService = (controller as any).pageHistoryService;
    pageRepo.findById = jest.fn().mockResolvedValue(page);
    pageAccessService.validateCanEdit = jest.fn();
    pageHistoryService.snapshotBeforeRestore = jest
      .fn()
      .mockResolvedValue(result);

    await expect(
      controller.snapshotBeforeRestore(dto, user, { id: 'workspace-1' } as any),
    ).resolves.toBe(result);
    expect(pageHistoryService.snapshotBeforeRestore).toHaveBeenCalledWith(
      page,
      dto,
      user,
    );
  });

  it('rejects a revision that belongs to another page', async () => {
    const page = {
      id: 'page-1',
      deletedAt: null,
      workspaceId: 'workspace-1',
    } as any;
    const pageRepo = (controller as any).pageRepo;
    const pageAccessService = (controller as any).pageAccessService;
    const pageHistoryService = (controller as any).pageHistoryService;
    pageRepo.findById = jest.fn().mockResolvedValue(page);
    pageAccessService.validateCanEdit = jest.fn();
    pageHistoryService.snapshotBeforeRestore = jest
      .fn()
      .mockRejectedValue(new BadRequestException('History revision mismatch'));

    await expect(
      controller.snapshotBeforeRestore(
        {
          pageId: 'page-1',
          historyId: 'revision-other-page',
          title: 'Rascunho',
          content: { type: 'doc', content: [] },
        },
        { id: 'user-1' } as any,
        { id: 'workspace-1' } as any,
      ),
    ).rejects.toThrow('History revision mismatch');
  });
});
