import { BadRequestException, ConflictException } from '@nestjs/common';
import { PagePropertyService } from './page-property.service';
import { PagePropertyRepo } from '@tcc-docs/db/repos/page-property/page-property.repo';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { PageAccessService } from '../page/page-access/page-access.service';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';

const user = { id: '11111111-1111-4111-8111-111111111111' } as any;
const page = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  workspaceId: 'workspace-1',
  spaceId: 'space-1',
  deletedAt: null,
} as any;
const definition = {
  id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  workspaceId: 'workspace-1',
  spaceId: 'space-1',
  type: 'number',
  config: {},
} as any;

describe('PagePropertyService', () => {
  let service: PagePropertyService;
  let propertyRepo: jest.Mocked<PagePropertyRepo>;
  let pageRepo: jest.Mocked<PageRepo>;
  let pageAccess: jest.Mocked<PageAccessService>;
  let spaceMemberRepo: jest.Mocked<SpaceMemberRepo>;
  let userRepo: jest.Mocked<UserRepo>;
  let workspaceRepo: jest.Mocked<WorkspaceRepo>;

  beforeEach(() => {
    propertyRepo = {
      findDefinition: jest.fn().mockResolvedValue(definition),
      listDefinitions: jest.fn(),
      createDefinition: jest.fn(),
      countValues: jest.fn().mockResolvedValue(0),
      updateDefinition: jest.fn(),
      deleteDefinition: jest.fn(),
      listValues: jest.fn(),
      deleteValue: jest.fn(),
      upsertValue: jest.fn(),
    } as any;
    pageRepo = { findById: jest.fn().mockResolvedValue(page) } as any;
    pageAccess = {
      validateCanView: jest.fn(),
      validateCanEdit: jest.fn(),
    } as any;
    spaceMemberRepo = {
      getUserSpaceRoles: jest.fn().mockResolvedValue([{ role: 'writer' }]),
    } as any;
    userRepo = {
      findById: jest.fn().mockResolvedValue({
        ...user,
        deletedAt: null,
        deactivatedAt: null,
      }),
    } as any;
    workspaceRepo = {
      findById: jest.fn().mockResolvedValue({ id: 'workspace-1' }),
    } as any;
    service = new PagePropertyService(
      propertyRepo,
      pageRepo,
      pageAccess,
      spaceMemberRepo,
      userRepo,
      workspaceRepo,
    );
  });

  it('rejects setting a definition from a different space', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      spaceId: 'space-2',
    });

    await expect(
      service.setValue({
        pageId: page.id,
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        user,
        value: 3,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(pageAccess.validateCanEdit).toHaveBeenCalledWith(page, user);
    expect(propertyRepo.upsertValue).not.toHaveBeenCalled();
  });

  it('requires page edit permission before upserting a value', async () => {
    propertyRepo.upsertValue.mockResolvedValue({ value: 3 } as any);

    await service.setValue({
      pageId: page.id,
      propertyId: definition.id,
      workspaceId: 'workspace-1',
      user,
      value: 3,
    });

    expect(pageAccess.validateCanEdit).toHaveBeenCalledWith(page, user);
    expect(propertyRepo.upsertValue).toHaveBeenCalledWith({
      pageId: page.id,
      propertyId: definition.id,
      updatedById: user.id,
      value: 3,
    });
  });

  it('allows setting a workspace definition on a page in any space', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      spaceId: null,
      type: 'person',
      config: { allowMultiple: false },
    });
    propertyRepo.upsertValue.mockResolvedValue({ value: 3 } as any);

    await service.setValue({
      pageId: page.id,
      propertyId: definition.id,
      workspaceId: 'workspace-1',
      user,
      value: user.id,
    });

    expect(propertyRepo.upsertValue).toHaveBeenCalled();
    expect(userRepo.findById).toHaveBeenCalledWith(user.id, 'workspace-1');
    expect(spaceMemberRepo.getUserSpaceRoles).not.toHaveBeenCalled();
  });

  it('rejects inactive people in workspace definitions', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      spaceId: null,
      type: 'person',
      config: { allowMultiple: false },
    });
    userRepo.findById.mockResolvedValue({
      ...user,
      deletedAt: null,
      deactivatedAt: new Date(),
    } as any);

    await expect(
      service.setValue({
        pageId: page.id,
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        user,
        value: user.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(propertyRepo.upsertValue).not.toHaveBeenCalled();
  });

  it('deletes the stored row when value is null', async () => {
    await expect(
      service.setValue({
        pageId: page.id,
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        user,
        value: null,
      }),
    ).resolves.toEqual({
      pageId: page.id,
      propertyId: definition.id,
      value: null,
    });

    expect(propertyRepo.deleteValue).toHaveBeenCalledWith(
      page.id,
      definition.id,
    );
    expect(propertyRepo.upsertValue).not.toHaveBeenCalled();
  });

  it('requires page view permission before returning values', async () => {
    propertyRepo.listValues.mockResolvedValue([{ value: 7 }] as any);

    await expect(
      service.getValues(page.id, 'workspace-1', user),
    ).resolves.toEqual([{ value: 7 }]);
    expect(pageAccess.validateCanView).toHaveBeenCalledWith(page, user);
  });

  it('rejects changing person cardinality while values exist', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      type: 'person',
      config: { allowMultiple: false },
    });
    propertyRepo.countValues.mockResolvedValue(1);

    await expect(
      service.updateDefinition({
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        config: { allowMultiple: true },
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(propertyRepo.updateDefinition).not.toHaveBeenCalled();
  });

  it('rejects person ids without access to the page space', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      type: 'person',
      config: { allowMultiple: false },
    });
    spaceMemberRepo.getUserSpaceRoles.mockResolvedValue(undefined);

    await expect(
      service.setValue({
        pageId: page.id,
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        user,
        value: user.id,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(propertyRepo.upsertValue).not.toHaveBeenCalled();
  });

  it('maps duplicate property names to a conflict', async () => {
    propertyRepo.createDefinition.mockRejectedValue({ code: '23505' });

    await expect(
      service.createDefinition({
        workspaceId: 'workspace-1',
        spaceId: 'space-1',
        userId: user.id,
        name: 'Due date',
        type: 'date',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('validates person cardinality before persistence', async () => {
    propertyRepo.findDefinition.mockResolvedValue({
      ...definition,
      type: 'person',
      config: { allowMultiple: false },
    });

    await expect(
      service.setValue({
        pageId: page.id,
        propertyId: definition.id,
        workspaceId: 'workspace-1',
        user,
        value: [user.id],
      }),
    ).rejects.toThrow();
    expect(propertyRepo.upsertValue).not.toHaveBeenCalled();
  });
});
