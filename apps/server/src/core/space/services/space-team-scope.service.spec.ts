import { NotFoundException } from '@nestjs/common';
import { UserRole } from '../../../common/helpers/types/permission';
import { ListSpacesDto } from '../dto/list-spaces.dto';
import { SpaceService } from './space.service';

const workspaceId = '00000000-0000-4000-8000-000000000001';
const teamId = '00000000-0000-4000-8000-000000000002';
const otherTeamId = '00000000-0000-4000-8000-000000000003';
const userId = '00000000-0000-4000-8000-000000000004';

function setup() {
  const spaceRepo = { getSpacesInWorkspace: jest.fn() };
  const teamService = { getTeam: jest.fn().mockResolvedValue({ id: teamId }) };
  const authorization = {
    resolve: jest.fn().mockResolvedValue({ canView: true }),
  };
  const service = new SpaceService(
    spaceRepo as never,
    {} as never,
    teamService as never,
    authorization as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
  );

  return { service, spaceRepo, teamService };
}

describe('SpaceService team-scoped list', () => {
  const user = { id: userId, workspaceId, role: UserRole.MEMBER } as never;

  it('returns only Spaces owned by the selected team', async () => {
    const { service, spaceRepo } = setup();
    spaceRepo.getSpacesInWorkspace.mockResolvedValue({
      items: [
        { id: 'space-erp', teamId },
        { id: 'space-shared', teamId: otherTeamId },
      ],
      meta: {},
    });

    const result = await service.getWorkspaceSpaces(user, workspaceId, {
      teamId,
    } as ListSpacesDto);

    expect(result.items.map((space) => space.id)).toEqual(['space-erp']);
  });

  it('does not query Spaces for a team outside the workspace', async () => {
    const { service, spaceRepo, teamService } = setup();
    teamService.getTeam.mockRejectedValue(
      new NotFoundException('Team not found'),
    );

    await expect(
      service.getWorkspaceSpaces(user, workspaceId, {
        teamId,
      } as ListSpacesDto),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(spaceRepo.getSpacesInWorkspace).not.toHaveBeenCalled();
  });
});
