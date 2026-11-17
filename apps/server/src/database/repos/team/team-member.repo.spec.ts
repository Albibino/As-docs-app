import { TeamRole } from '../../../common/helpers/types/permission';
import { TeamMemberRepo } from './team-member.repo';

describe('TeamMemberRepo', () => {
  it('qualifies the team role while counting active administrators', async () => {
    const query: any = {
      innerJoin: jest.fn(() => query),
      select: jest.fn(() => query),
      where: jest.fn(() => query),
      executeTakeFirst: jest.fn().mockResolvedValue({ count: 2 }),
    };
    const db = { selectFrom: jest.fn(() => query) };
    const repo = new TeamMemberRepo(db as never, {} as never, {} as never);

    await expect(repo.countAdmins('team-id')).resolves.toBe(2);

    expect(query.where).toHaveBeenCalledWith(
      'teamMembers.role',
      '=',
      TeamRole.ADMIN,
    );
  });
});
