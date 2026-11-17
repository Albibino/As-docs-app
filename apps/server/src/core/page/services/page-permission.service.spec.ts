import { ForbiddenException } from '@nestjs/common';
import { UserRole } from '../../../common/helpers/types/permission';
import { PagePermissionService } from './page-permission.service';

const page = {
  id: '00000000-0000-4000-8000-000000000002',
  workspaceId: '00000000-0000-4000-8000-000000000001',
  spaceId: '00000000-0000-4000-8000-000000000003',
  creatorId: '00000000-0000-4000-8000-000000000004',
  deletedAt: null,
};
const actor = { id: page.creatorId, workspaceId: page.workspaceId, role: UserRole.MEMBER };

function setup() {
  const trx = {};
  const db = { transaction: () => ({ execute: (callback: (value: unknown) => unknown) => callback(trx) }) };
  const pageRepo = { findById: jest.fn().mockResolvedValue(page) };
  const pagePermissionRepo = {
    findPageAccessByPageId: jest.fn().mockResolvedValue(undefined),
    findRestrictedAncestor: jest.fn().mockResolvedValue(undefined),
    insertPageAccess: jest.fn().mockResolvedValue({ id: 'access-id' }),
    insertPagePermissions: jest.fn(),
  };
  const pageAccessService = { validateCanView: jest.fn() };
  const ability = { createForUser: jest.fn() };
  const service = new PagePermissionService(pageRepo as never, pagePermissionRepo as never, pageAccessService as never, ability as never, db as never);
  return { service, pagePermissionRepo, pageAccessService };
}

describe('PagePermissionService', () => {
  it('creates a restricted rule that preserves creator access', async () => {
    const { service, pagePermissionRepo } = setup();
    await service.restrictPage(page.id, actor as never);
    expect(pagePermissionRepo.insertPagePermissions).toHaveBeenCalledWith(
      [expect.objectContaining({ userId: actor.id, canView: true, canEdit: true, includeSubpages: true })],
      expect.anything(),
    );
  });

  it('does not expose access information when the page cannot be viewed', async () => {
    const { service, pageAccessService } = setup();
    pageAccessService.validateCanView.mockRejectedValue(new ForbiddenException());
    await expect(service.getRestrictionInfo(page.id, actor as never)).rejects.toBeInstanceOf(ForbiddenException);
  });
});
