import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TeamRole, UserRole } from '../../../common/helpers/types/permission';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { TeamService } from './team.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const teamId = '00000000-0000-4000-8000-000000000002';
const actorId = '00000000-0000-4000-8000-000000000003';
const memberId = '00000000-0000-4000-8000-000000000004';
const spaceId = '00000000-0000-4000-8000-000000000005';

function user(id: string, role: UserRole) {
  return { id, role, workspaceId } as never;
}

function setup() {
  const trxQuery: any = {
    select: jest.fn(() => trxQuery),
    where: jest.fn(() => trxQuery),
    execute: jest.fn().mockResolvedValue([]),
  };
  const trx = {
    selectFrom: jest.fn(() => trxQuery),
    deleteFrom: jest.fn(() => trxQuery),
  };
  const db = {
    transaction: () => ({
      execute: (callback: (value: unknown) => unknown) => callback(trx),
    }),
  };
  const teamRepo = {
    findById: jest.fn().mockResolvedValue({
      id: teamId,
      workspaceId,
      name: 'Engineering',
    }),
    findByName: jest.fn(),
    getTeamsPaginated: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const teamMemberRepo = {
    findMembership: jest.fn(),
    getMembersPaginated: jest.fn(),
    countAdmins: jest.fn(),
    add: jest.fn(),
    updateRole: jest.fn(),
    remove: jest.fn(),
  };
  const userRepo = { findById: jest.fn() };
  const notificationService = { create: jest.fn() };
  const spaceMemberRepo = { invalidateUserSpaceRoles: jest.fn() };
  const spacePermissionRepo = {
    grantDefaultAccessForTeamMember: jest.fn(),
    upsertBatch: jest.fn(),
  };
  const service = new TeamService(
    teamRepo as never,
    teamMemberRepo as never,
    userRepo as never,
    db as never,
    notificationService as never,
    spaceMemberRepo as never,
    spacePermissionRepo as never,
  );

  return {
    service,
    teamRepo,
    teamMemberRepo,
    userRepo,
    notificationService,
    spaceMemberRepo,
    spacePermissionRepo,
    trx,
  };
}

describe('TeamService', () => {
  it('creates a team and makes the workspace admin its first admin atomically', async () => {
    const { service, teamRepo, teamMemberRepo, trx } = setup();
    const actor = user(actorId, UserRole.ADMIN);
    teamRepo.findByName.mockResolvedValue(undefined);
    teamRepo.insert.mockResolvedValue({ id: teamId, workspaceId });

    await service.createTeam(actor, workspaceId, {
      name: 'Engineering',
      description: 'Product engineering',
    });

    expect(teamRepo.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Engineering',
        workspaceId,
        creatorId: actorId,
      }),
      trx,
    );
    expect(teamMemberRepo.add).toHaveBeenCalledWith(
      actorId,
      teamId,
      workspaceId,
      TeamRole.ADMIN,
      actorId,
      trx,
    );
  });

  it('does not allow a regular workspace member to create teams', async () => {
    const { service } = setup();

    await expect(
      service.createTeam(user(actorId, UserRole.MEMBER), workspaceId, {
        name: 'Engineering',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('limits the team list to memberships for regular users', async () => {
    const { service, teamRepo } = setup();
    const pagination = new PaginationOptions();
    teamRepo.getTeamsPaginated.mockResolvedValue({ items: [], meta: {} });

    await service.listTeams(
      user(actorId, UserRole.MEMBER),
      workspaceId,
      pagination,
    );

    expect(teamRepo.getTeamsPaginated).toHaveBeenCalledWith(
      workspaceId,
      pagination,
      actorId,
    );
  });

  it('allows a team admin to add a workspace user as member', async () => {
    const { service, teamMemberRepo, userRepo, notificationService, trx } =
      setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce(undefined);
    userRepo.findById.mockResolvedValue({ id: memberId, workspaceId });

    await service.addMembers(user(actorId, UserRole.MEMBER), workspaceId, {
      teamId,
      userIds: [memberId],
      role: TeamRole.MEMBER,
    });

    expect(teamMemberRepo.add).toHaveBeenCalledWith(
      memberId,
      teamId,
      workspaceId,
      TeamRole.MEMBER,
      actorId,
      trx,
    );
    expect(notificationService.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: memberId,
        type: 'team.member_added',
      }),
    );
  });

  it('rejects users that do not belong to the workspace', async () => {
    const { service, teamMemberRepo, userRepo } = setup();
    teamMemberRepo.findMembership.mockResolvedValue({ role: TeamRole.ADMIN });
    userRepo.findById.mockResolvedValue(undefined);

    await expect(
      service.addMembers(user(actorId, UserRole.MEMBER), workspaceId, {
        teamId,
        userIds: [memberId],
        role: TeamRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('applies the confirmed initial Space permissions atomically', async () => {
    const {
      service,
      teamMemberRepo,
      userRepo,
      spacePermissionRepo,
      trx,
    } = setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce(undefined);
    userRepo.findById.mockResolvedValue({ id: memberId, workspaceId });
    trx.selectFrom().execute.mockResolvedValue([
      { id: spaceId, archivedAt: null },
    ]);

    await service.addMembers(user(actorId, UserRole.MEMBER), workspaceId, {
      teamId,
      userIds: [memberId],
      role: TeamRole.MEMBER,
      permissions: [
        {
          userId: memberId,
          spaceId,
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
        },
      ],
    });

    expect(spacePermissionRepo.upsertBatch).toHaveBeenCalledWith(
      spaceId,
      [
        {
          userId: memberId,
          canView: true,
          canCreate: true,
          canEdit: false,
          canDelete: false,
        },
      ],
      actorId,
      trx,
    );
  });

  it('protects the last team admin from demotion', async () => {
    const { service, teamMemberRepo } = setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce({ role: TeamRole.ADMIN });
    teamMemberRepo.countAdmins.mockResolvedValue(1);

    await expect(
      service.updateMemberRole(user(actorId, UserRole.MEMBER), workspaceId, {
        teamId,
        userId: actorId,
        role: TeamRole.MEMBER,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('invalidates the member role cache after a role change', async () => {
    const { service, teamMemberRepo, spaceMemberRepo, trx } = setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce({ role: TeamRole.MEMBER });
    trx.selectFrom().execute.mockResolvedValue([{ id: spaceId }]);

    await service.updateMemberRole(user(actorId, UserRole.ADMIN), workspaceId, {
      teamId,
      userId: memberId,
      role: TeamRole.ADMIN,
    });

    expect(spaceMemberRepo.invalidateUserSpaceRoles).toHaveBeenCalledWith(
      [memberId],
      [spaceId],
    );
  });

  it('removes stale explicit Space permissions when promoting a member', async () => {
    const { service, teamMemberRepo, trx } = setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce({ role: TeamRole.MEMBER });
    trx.selectFrom().execute.mockResolvedValue([{ id: spaceId }]);

    await service.updateMemberRole(user(actorId, UserRole.ADMIN), workspaceId, {
      teamId,
      userId: memberId,
      role: TeamRole.ADMIN,
    });

    expect(trx.deleteFrom).toHaveBeenCalledWith('spacePermissions');
  });

  it('protects the last team admin from removal', async () => {
    const { service, teamMemberRepo } = setup();
    teamMemberRepo.findMembership
      .mockResolvedValueOnce({ role: TeamRole.ADMIN })
      .mockResolvedValueOnce({ role: TeamRole.ADMIN });
    teamMemberRepo.countAdmins.mockResolvedValue(1);

    await expect(
      service.removeMember(user(actorId, UserRole.MEMBER), workspaceId, {
        teamId,
        userId: actorId,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('removes page permissions when a member leaves the team', async () => {
    const { service, teamMemberRepo, trx } = setup();
    teamMemberRepo.findMembership.mockResolvedValue({ role: TeamRole.MEMBER });

    await service.removeMember(user(actorId, UserRole.ADMIN), workspaceId, {
      teamId,
      userId: memberId,
    });

    expect(trx.deleteFrom).toHaveBeenCalledWith('pagePermissions');
  });
});
