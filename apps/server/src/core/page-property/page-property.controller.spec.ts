import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ZodError } from 'zod';
import { PagePropertyController } from './page-property.controller';
import { PagePropertyService } from './page-property.service';
import { SpaceService } from '../space/services/space.service';
import SpaceAbilityFactory from '../casl/abilities/space-ability.factory';
import { SpaceCaslAction } from '../casl/interfaces/space-ability.type';
import WorkspaceAbilityFactory from '../casl/abilities/workspace-ability.factory';
import { WorkspaceCaslAction } from '../casl/interfaces/workspace-ability.type';

const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;
const definition = { id: 'property-1', spaceId: 'space-1' } as any;

describe('PagePropertyController', () => {
  let controller: PagePropertyController;
  let service: jest.Mocked<PagePropertyService>;
  let spaceService: jest.Mocked<SpaceService>;
  let ability: { cannot: jest.Mock };
  let workspaceAbility: { cannot: jest.Mock };

  beforeEach(() => {
    service = {
      listDefinitions: jest.fn(),
      createDefinition: jest.fn(),
      getDefinition: jest.fn().mockResolvedValue(definition),
      updateDefinition: jest.fn(),
      deleteDefinition: jest.fn(),
      getValues: jest.fn(),
      setValue: jest.fn(),
    } as any;
    spaceService = { getSpaceInfo: jest.fn() } as any;
    ability = { cannot: jest.fn().mockReturnValue(false) };
    workspaceAbility = { cannot: jest.fn().mockReturnValue(false) };
    const abilityFactory = {
      createForUser: jest.fn().mockResolvedValue(ability),
    } as unknown as SpaceAbilityFactory;
    controller = new PagePropertyController(
      service,
      spaceService,
      abilityFactory,
      {
        createForUser: jest.fn().mockReturnValue(workspaceAbility),
      } as unknown as WorkspaceAbilityFactory,
    );
  });

  it('requires Manage/Settings to create a workspace definition', async () => {
    service.createDefinition.mockResolvedValue({
      ...definition,
      spaceId: null,
    });

    await controller.createWorkspaceDefinition(
      { name: 'Department', type: 'person', config: {} },
      user,
      workspace,
    );

    expect(workspaceAbility.cannot).toHaveBeenCalledWith(
      WorkspaceCaslAction.Manage,
      'settings',
    );
    expect(service.createDefinition).toHaveBeenCalledWith({
      name: 'Department',
      type: 'person',
      config: {},
      spaceId: null,
      workspaceId: 'workspace-1',
      userId: 'user-1',
    });
  });

  it('requires Read/Settings to list space definitions', async () => {
    service.listDefinitions.mockResolvedValue([]);

    await controller.listDefinitions({ spaceId: 'space-1' }, user, workspace);

    expect(spaceService.getSpaceInfo).toHaveBeenCalledWith(
      'space-1',
      'workspace-1',
    );
    expect(ability.cannot).toHaveBeenCalledWith(
      SpaceCaslAction.Read,
      'settings',
    );
  });

  it('rejects definition creation without Manage/Settings', async () => {
    ability.cannot.mockReturnValue(true);

    await expect(
      controller.createDefinition(
        { spaceId: 'space-1', name: 'Due', type: 'date', config: {} },
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(service.createDefinition).not.toHaveBeenCalled();
  });

  it('authorizes update against the definition owning space', async () => {
    service.updateDefinition.mockResolvedValue(definition);

    await controller.updateDefinition(
      { propertyId: 'property-1', name: 'Estimate' },
      user,
      workspace,
    );

    expect(service.getDefinition).toHaveBeenCalledWith(
      'property-1',
      'workspace-1',
    );
    expect(spaceService.getSpaceInfo).toHaveBeenCalledWith(
      'space-1',
      'workspace-1',
    );
    expect(ability.cannot).toHaveBeenCalledWith(
      SpaceCaslAction.Manage,
      'settings',
    );
  });

  it('maps schema failures from value writes to a 400 response', async () => {
    service.setValue.mockRejectedValue(
      new ZodError([{ code: 'custom', path: ['value'], message: 'invalid' }]),
    );

    await expect(
      controller.setValue(
        { pageId: 'page-1', propertyId: 'property-1', value: 'bad' },
        user,
        workspace,
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
