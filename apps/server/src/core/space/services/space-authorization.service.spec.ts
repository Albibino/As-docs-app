import { NotFoundException } from '@nestjs/common';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { SpaceAuthorizationService } from './space-authorization.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const spaceId = '00000000-0000-4000-8000-000000000002';
const teamId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000004';

function setup() {
  const spaceRepo = {
    findById: jest.fn().mockResolvedValue({
      id: spaceId,
      workspaceId,
      teamId,
      archivedAt: null,
    }),
  };
  const teamMemberRepo = { findMembership: jest.fn() };
  const permissionRepo = { findForUser: jest.fn() };
  const pagePermissionRepo = { hasSharedPermissionForSpace: jest.fn().mockResolvedValue(false) };
  const service = new SpaceAuthorizationService(
    spaceRepo as never,
    teamMemberRepo as never,
    permissionRepo as never,
    pagePermissionRepo as never,
  );
  return { service, spaceRepo, teamMemberRepo, permissionRepo, pagePermissionRepo };
}

function user(role: UserRole = UserRole.MEMBER) {
  return { id: userId, workspaceId, role } as never;
}

describe('SpaceAuthorizationService', () => {
  it('gives full access to workspace admins without requiring team membership', async () => {
    const { service, teamMemberRepo } = setup();

    await expect(
      service.resolve(user(UserRole.ADMIN), spaceId),
    ).resolves.toEqual(
      expect.objectContaining({
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: true,
        source: 'workspace-admin',
      }),
    );
    expect(teamMemberRepo.findMembership).not.toHaveBeenCalled();
  });

  it('gives full access to team admins', async () => {
    const { service, teamMemberRepo, permissionRepo } = setup();
    teamMemberRepo.findMembership.mockResolvedValue({ role: TeamRole.ADMIN });

    await expect(service.resolve(user(), spaceId)).resolves.toEqual(
      expect.objectContaining({ source: 'team-admin', canEdit: true, canDelete: true }),
    );
    expect(permissionRepo.findForUser).not.toHaveBeenCalled();
  });

  it('uses the explicit ACL for regular team members', async () => {
    const { service, teamMemberRepo, permissionRepo } = setup();
    teamMemberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });
    permissionRepo.findForUser.mockResolvedValue({
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });

    const permission = await service.resolve(user(), spaceId);

    expect(permission).toEqual({
      userId,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
      source: 'explicit',
    });
  });

  it('does not allow an explicit ACL to bypass team membership', async () => {
    const { service, teamMemberRepo, permissionRepo } = setup();
    teamMemberRepo.findMembership.mockResolvedValue(undefined);
    permissionRepo.findForUser.mockResolvedValue({ canView: true });

    await expect(service.resolve(user(), spaceId)).resolves.toBeNull();
    expect(permissionRepo.findForUser).not.toHaveBeenCalled();
  });

  it('hides archived spaces from regular members', async () => {
    const { service, spaceRepo, teamMemberRepo } = setup();
    spaceRepo.findById.mockResolvedValue({
      id: spaceId,
      workspaceId,
      teamId,
      archivedAt: new Date(),
    });
    teamMemberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });

    await expect(service.resolve(user(), spaceId)).resolves.toBeNull();
  });

  it('keeps archived spaces administrable but freezes page mutations', async () => {
    const { service, spaceRepo } = setup();
    spaceRepo.findById.mockResolvedValue({
      id: spaceId,
      workspaceId,
      teamId,
      archivedAt: new Date(),
    });

    await expect(service.resolve(user(UserRole.ADMIN), spaceId)).resolves.toEqual(
      expect.objectContaining({
        source: 'workspace-admin',
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      }),
    );
  });

  it('returns not found when view access is missing', async () => {
    const { service, teamMemberRepo } = setup();
    teamMemberRepo.findMembership.mockResolvedValue(undefined);

    await expect(service.requireView(user(), spaceId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
