import { ForbiddenException } from '@nestjs/common';
import { LabelPermissionService } from './label-permission.service';

const user = { id: 'user-1' } as any;
const workspace = { id: 'workspace-1' } as any;

describe('LabelPermissionService', () => {
  function createService(
    opts: {
      spaceExists?: boolean;
      spaceCannot?: boolean;
      workspaceCannot?: boolean;
    } = {},
  ) {
    const spaceAbility = {
      createForUser: jest.fn().mockResolvedValue({
        cannot: jest.fn().mockReturnValue(opts.spaceCannot ?? false),
      }),
    };
    const workspaceAbility = {
      createForUser: jest.fn().mockReturnValue({
        cannot: jest.fn().mockReturnValue(opts.workspaceCannot ?? false),
      }),
    };
    const spaceRepo = {
      findById: jest
        .fn()
        .mockResolvedValue(
          opts.spaceExists === false ? undefined : { id: 'space-1' },
        ),
    };
    return {
      service: new LabelPermissionService(
        spaceAbility as any,
        workspaceAbility as any,
        spaceRepo as any,
      ),
      spaceAbility,
      workspaceAbility,
      spaceRepo,
    };
  }

  it('rejects a space from another workspace before checking CASL', async () => {
    const { service, spaceAbility, spaceRepo } = createService({
      spaceExists: false,
    });

    await expect(
      service.resolveManageableOwner(user, workspace, 'foreign-space'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(spaceRepo.findById).toHaveBeenCalledWith(
      'foreign-space',
      workspace.id,
    );
    expect(spaceAbility.createForUser).not.toHaveBeenCalled();
  });

  it('requires Manage/Label for a space-owned taxonomy', async () => {
    const { service } = createService({ spaceCannot: true });

    await expect(
      service.resolveManageableOwner(user, workspace, 'space-1'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('requires Manage/Label for a workspace-owned taxonomy', async () => {
    const { service } = createService({ workspaceCannot: true });

    await expect(
      service.resolveManageableOwner(user, workspace),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
