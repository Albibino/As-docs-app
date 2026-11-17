import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { SpacePermissionService } from './space-permission.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const spaceId = '00000000-0000-4000-8000-000000000002';
const teamId = '00000000-0000-4000-8000-000000000003';
const actorId = '00000000-0000-4000-8000-000000000004';
const memberId = '00000000-0000-4000-8000-000000000005';

function setup(source = 'team-admin') {
  const trx = {};
  const db = {
    transaction: () => ({
      execute: (callback: (value: unknown) => unknown) => callback(trx),
    }),
  };
  const teamService = {
    requireTeamAdmin:
      source === 'explicit'
        ? jest.fn().mockRejectedValue(new ForbiddenException())
        : jest.fn().mockResolvedValue(undefined),
  };
  const spaceRepo = {
    findById: jest.fn().mockResolvedValue({ id: spaceId, workspaceId, teamId }),
  };
  const memberRepo = { findMembership: jest.fn() };
  const permissionRepo = {
    upsertBatch: jest.fn(),
    getPermissionMatrix: jest.fn(),
    findForUsers: jest.fn().mockResolvedValue([]),
    findForSpace: jest.fn().mockResolvedValue([]),
    deleteExceptUsers: jest.fn(),
  };
  const notificationService = { create: jest.fn() };
  const spaceMemberRepo = { invalidateUserSpaceRoles: jest.fn() };
  const service = new SpacePermissionService(
    teamService as never,
    spaceRepo as never,
    memberRepo as never,
    permissionRepo as never,
    db as never,
    notificationService as never,
    spaceMemberRepo as never,
  );
  return {
    service,
    memberRepo,
    permissionRepo,
    notificationService,
    spaceMemberRepo,
    trx,
  };
}

const actor = {
  id: actorId,
  workspaceId,
  role: UserRole.MEMBER,
} as never;

describe('SpacePermissionService', () => {
  it('updates valid member permissions in one transaction', async () => {
    const {
      service,
      memberRepo,
      permissionRepo,
        notificationService,
      trx,
    } = setup();
    memberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });
    const permissions = [
      {
        userId: memberId,
        canView: true,
        canCreate: true,
        canEdit: true,
        canDelete: false,
      },
    ];

    await service.updatePermissions(actor, workspaceId, {
      spaceId,
      permissions,
    });

    expect(permissionRepo.upsertBatch).toHaveBeenCalledWith(
      spaceId,
      permissions,
      actorId,
      trx,
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: memberId,
        type: 'space.access_granted',
      }),
    );
  });

  it('rejects dependent flags without view access', async () => {
    const { service, memberRepo } = setup();
    memberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });

    await expect(
      service.updatePermissions(actor, workspaceId, {
        spaceId,
        permissions: [
          {
            userId: memberId,
            canView: false,
            canCreate: false,
            canEdit: true,
            canDelete: false,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects ACLs for users outside the team and for inherited admins', async () => {
    const { service, memberRepo } = setup();
    memberRepo.findMembership.mockResolvedValue({ role: TeamRole.ADMIN });

    await expect(
      service.updatePermissions(actor, workspaceId, {
        spaceId,
        permissions: [
          {
            userId: memberId,
            canView: true,
            canCreate: false,
            canEdit: false,
            canDelete: false,
          },
        ],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('allows only inherited admins to change the ACL', async () => {
    const { service } = setup('explicit');

    await expect(
      service.updatePermissions(actor, workspaceId, {
        spaceId,
        permissions: [],
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('removes omitted permissions when replacing the ACL', async () => {
    const { service, memberRepo, permissionRepo, trx } = setup();
    memberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });
    permissionRepo.findForSpace.mockResolvedValue([
      {
        userId: memberId,
        canView: false,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      },
    ]);

    await service.updatePermissions(actor, workspaceId, {
      spaceId,
      permissions: [],
    });

    expect(permissionRepo.deleteExceptUsers).toHaveBeenCalledWith(
      spaceId,
      [],
      trx,
    );
    expect(permissionRepo.upsertBatch).toHaveBeenCalledWith(
      spaceId,
      [],
      actorId,
      trx,
    );
  });

  it('updates one member without removing permissions for other members', async () => {
    const { service, memberRepo, permissionRepo, trx } = setup();
    const otherMemberId = '00000000-0000-4000-8000-000000000006';
    memberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });
    permissionRepo.findForUsers.mockResolvedValue([
      {
        userId: memberId,
        canView: true,
        canCreate: false,
        canEdit: false,
        canDelete: false,
      },
    ]);

    await service.updateMemberPermission(actor, workspaceId, {
      spaceId,
      userId: memberId,
      canView: true,
      canCreate: true,
      canEdit: true,
      canDelete: false,
    });

    expect(permissionRepo.deleteExceptUsers).not.toHaveBeenCalled();
    expect(permissionRepo.upsertBatch).toHaveBeenCalledWith(
      spaceId,
      [
        {
          userId: memberId,
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: false,
        },
      ],
      actorId,
      trx,
    );
    expect(permissionRepo.upsertBatch).not.toHaveBeenCalledWith(
      spaceId,
      expect.arrayContaining([expect.objectContaining({ userId: otherMemberId })]),
      actorId,
      trx,
    );
  });
});
