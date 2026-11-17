import { ForbiddenException } from '@nestjs/common';
import { PageAccessService } from './page-access.service';
import {
  SpaceCaslAction,
  SpaceCaslSubject,
} from '../../casl/interfaces/space-ability.type';

const userId = '00000000-0000-4000-8000-000000000001';

function setup(allowed: SpaceCaslAction[]) {
  const ability = {
    can: jest.fn((action: SpaceCaslAction, _subject?: SpaceCaslSubject) =>
      allowed.includes(action),
    ),
    cannot: jest.fn(
      (action: SpaceCaslAction, _subject?: SpaceCaslSubject) =>
        !allowed.includes(action),
    ),
  };
  const pagePermissionRepo = {
    canUserAccessPage: jest.fn().mockResolvedValue(true),
    canUserEditPage: jest.fn().mockResolvedValue({
      hasAnyRestriction: false,
      canAccess: true,
      canEdit: false,
    }),
    getEffectivePermission: jest.fn().mockResolvedValue({
      hasRestriction: false,
      permission: undefined,
      blocked: false,
    }),
  };
  const spaceRepo = { findById: jest.fn().mockResolvedValue(null) };
  const pageRepo = {
    getActiveDescendants: jest.fn().mockResolvedValue([]),
    findById: jest.fn(),
  };
  const service = new PageAccessService(
    pagePermissionRepo as never,
    { createForUser: jest.fn().mockResolvedValue(ability) } as never,
    spaceRepo as never,
    pageRepo as never,
  );
  return { service, ability, pagePermissionRepo, spaceRepo, pageRepo };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: 'page-id',
    spaceId: 'space-id',
    creatorId: userId,
    createdAt: new Date(),
    deletedAt: null,
    ...overrides,
  } as never;
}

const user = { id: userId } as never;

describe('PageAccessService authorship rules', () => {
  it('allows the page creator to manage sharing', async () => {
    const { service } = setup([]);

    await expect(
      service.validateCanManageShare(page(), user),
    ).resolves.toBeUndefined();
  });

  it('rejects an editor who is not a page creator or space administrator', async () => {
    const { service } = setup([SpaceCaslAction.Read, SpaceCaslAction.Edit]);

    await expect(
      service.validateCanManageShare(page({ creatorId: 'another-user' }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows inherited Space administrators to manage sharing', async () => {
    const { service, ability } = setup([SpaceCaslAction.Read]);
    ability.can.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        action === SpaceCaslAction.Manage &&
        subject === SpaceCaslSubject.Settings,
    );

    await expect(
      service.validateCanManageShare(page({ creatorId: 'another-user' }), user),
    ).resolves.toBeUndefined();
  });

  it('lets the creator edit while they can still view the space', async () => {
    const { service, pagePermissionRepo } = setup([SpaceCaslAction.Read]);
    pagePermissionRepo.getEffectivePermission.mockResolvedValue({
      hasRestriction: true,
      permission: undefined,
      blocked: false,
    });

    await expect(service.validateCanEdit(page(), user)).resolves.toEqual({
      hasRestriction: true,
    });
  });

  it('returns effective edit access for an unrestricted page created by the user', async () => {
    const { service, pagePermissionRepo } = setup([SpaceCaslAction.Read]);
    pagePermissionRepo.canUserEditPage.mockResolvedValue({
      hasAnyRestriction: false,
      canAccess: true,
      canEdit: false,
    });

    await expect(
      service.validateCanViewWithPermissions(page(), user),
    ).resolves.toEqual({ canEdit: true, hasRestriction: false });
  });

  it('lets an explicit editor edit an unrestricted page created by another member', async () => {
    const { service } = setup([SpaceCaslAction.Read, SpaceCaslAction.Edit]);

    await expect(
      service.validateCanEdit(page({ creatorId: 'another-user' }), user),
    ).resolves.toEqual({ hasRestriction: false });
  });

  it('does not let an explicit editor bypass a restricted page', async () => {
    const { service, pagePermissionRepo } = setup([
      SpaceCaslAction.Read,
      SpaceCaslAction.Edit,
    ]);
    pagePermissionRepo.getEffectivePermission.mockResolvedValue({
      hasRestriction: true,
      permission: undefined,
      blocked: true,
    });

    await expect(
      service.validateCanEdit(page({ creatorId: 'another-user' }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not let authorship bypass an archived space', async () => {
    const { service, spaceRepo } = setup([
      SpaceCaslAction.Read,
      SpaceCaslAction.Edit,
      SpaceCaslAction.Delete,
    ]);
    spaceRepo.findById.mockResolvedValue({ archivedAt: new Date() });

    await expect(service.validateCanEdit(page(), user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      service.validateCanDelete(page(), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('never lets authorship bypass removal of space view access', async () => {
    const { service } = setup([]);
    await expect(service.validateCanEdit(page(), user)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('lets inherited Space administrators view restricted pages', async () => {
    const { service, ability, pagePermissionRepo } = setup([
      SpaceCaslAction.Read,
    ]);
    ability.can.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        action === SpaceCaslAction.Read ||
        (action === SpaceCaslAction.Manage &&
          subject === SpaceCaslSubject.Settings),
    );
    ability.cannot.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        !ability.can(action, subject),
    );
    pagePermissionRepo.canUserAccessPage.mockResolvedValue(false);

    await expect(
      service.validateCanView(page(), user),
    ).resolves.toBeUndefined();
  });

  it('lets the creator trash their page during the first 15 minutes without canDelete', async () => {
    const { service } = setup([SpaceCaslAction.Read]);
    await expect(
      service.validateCanDelete(page(), user),
    ).resolves.toBeUndefined();
  });

  it('requires canDelete after the 15 minute creator window expires', async () => {
    const { service } = setup([SpaceCaslAction.Read]);
    const createdAt = new Date(Date.now() - 16 * 60 * 1000);

    await expect(
      service.validateCanDelete(page({ createdAt }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('blocks an author from trashing a tree with a descendant created by another user', async () => {
    const { service, pageRepo } = setup([SpaceCaslAction.Read]);
    pageRepo.getActiveDescendants.mockResolvedValue([
      { id: 'page-id', creatorId: userId },
      { id: 'child-page-id', creatorId: 'another-user' },
    ]);
    pageRepo.findById.mockResolvedValue(
      page({ id: 'child-page-id', creatorId: 'another-user' }),
    );

    await expect(
      service.validateCanDeleteTree(page(), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows canDelete users only when page-level access also permits it', async () => {
    const { service, pagePermissionRepo } = setup([
      SpaceCaslAction.Read,
      SpaceCaslAction.Delete,
    ]);
    pagePermissionRepo.getEffectivePermission.mockResolvedValue({
      hasRestriction: true,
      permission: undefined,
      blocked: true,
    });

    await expect(
      service.validateCanDelete(page({ creatorId: 'another-user' }), user),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows the eligible creator to restore from trash', async () => {
    const { service } = setup([SpaceCaslAction.Read]);
    await expect(
      service.validateCanRestore(
        page({ deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) }),
        user,
      ),
    ).resolves.toBeUndefined();
  });

  it('allows an inherited admin to restore from trash', async () => {
    const { service, ability } = setup([SpaceCaslAction.Read]);
    ability.can.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        action === SpaceCaslAction.Read ||
        (action === SpaceCaslAction.Manage &&
          subject === SpaceCaslSubject.Settings),
    );
    ability.cannot.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        !ability.can(action, subject),
    );

    await expect(
      service.validateCanRestore(
        page({
          creatorId: 'another-user',
          deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        }),
        user,
      ),
    ).resolves.toBeUndefined();
  });

  it('allows an inherited admin to restore from an archived space', async () => {
    const { service, ability, spaceRepo } = setup([SpaceCaslAction.Read]);
    ability.can.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        action === SpaceCaslAction.Read ||
        (action === SpaceCaslAction.Manage &&
          subject === SpaceCaslSubject.Settings),
    );
    ability.cannot.mockImplementation(
      (action: SpaceCaslAction, subject?: SpaceCaslSubject) =>
        !ability.can(action, subject),
    );
    spaceRepo.findById.mockResolvedValue({ archivedAt: new Date() });

    await expect(
      service.validateCanRestore(
        page({
          creatorId: 'another-user',
          deletedAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000),
        }),
        user,
      ),
    ).resolves.toBeUndefined();
  });
});
