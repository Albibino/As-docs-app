import {
  buildTeamSpaceMigrationPlan,
  normalizeTeamName,
} from './team-space-name-convention';

const workspaceId = 'workspace-1';
const createdAt = new Date('2026-09-10T12:00:00.000Z');

function users() {
  return [
    { id: 'owner', workspaceId, role: 'owner' as const, createdAt },
    { id: 'admin', workspaceId, role: 'admin' as const, createdAt },
    { id: 'writer', workspaceId, role: 'member' as const, createdAt },
    { id: 'reader', workspaceId, role: 'member' as const, createdAt },
  ];
}

describe('team space name convention', () => {
  it('creates teams from bases, assigns referenced spaces, and preserves direct access', () => {
    const plan = buildTeamSpaceMigrationPlan(
      [
        { id: 'dev', workspaceId, name: '[Time] Dév', creatorId: 'owner' },
        {
          id: 'workshop',
          workspaceId,
          name: '[dev] WorkShop',
          creatorId: 'owner',
        },
        { id: 'other', workspaceId, name: 'Other', creatorId: 'owner' },
      ],
      [
        { spaceId: 'dev', userId: 'admin', role: 'admin', addedById: 'owner' },
        {
          spaceId: 'workshop',
          userId: 'writer',
          role: 'writer',
          addedById: 'admin',
        },
        {
          spaceId: 'workshop',
          userId: 'reader',
          role: 'reader',
          addedById: 'admin',
        },
      ],
      users(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.teams).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Dév', creatorId: 'owner' }),
        expect.objectContaining({ name: 'General', creatorId: 'owner' }),
      ]),
    );
    expect(plan.spaces).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'dev', name: 'Dév', teamName: 'Dév' }),
        expect.objectContaining({
          id: 'workshop',
          name: 'WorkShop',
          teamName: 'Dév',
        }),
        expect.objectContaining({
          id: 'other',
          name: 'Other',
          teamName: 'General',
        }),
      ]),
    );
    expect(plan.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'admin', role: 'admin' }),
        expect.objectContaining({ userId: 'writer', role: 'member' }),
        expect.objectContaining({ userId: 'reader', role: 'member' }),
        expect.objectContaining({
          teamKey: `${workspaceId}:general`,
          userId: 'owner',
          role: 'admin',
        }),
      ]),
    );
    expect(plan.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: 'workshop',
          userId: 'writer',
          canView: true,
          canCreate: true,
          canEdit: true,
          canDelete: false,
        }),
        expect.objectContaining({
          spaceId: 'workshop',
          userId: 'reader',
          canView: true,
          canCreate: false,
          canEdit: false,
          canDelete: false,
        }),
      ]),
    );
  });

  it('promotes an administrator from any space to inherited team access', () => {
    const plan = buildTeamSpaceMigrationPlan(
      [
        { id: 'base', workspaceId, name: '[Time] Dev', creatorId: 'owner' },
        { id: 'child', workspaceId, name: '[Dev] API', creatorId: 'owner' },
      ],
      [
        {
          spaceId: 'base',
          userId: 'writer',
          role: 'writer',
          addedById: 'owner',
        },
        {
          spaceId: 'child',
          userId: 'writer',
          role: 'admin',
          addedById: 'owner',
        },
      ],
      users(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.members).toContainEqual(
      expect.objectContaining({ userId: 'writer', role: 'admin' }),
    );
    expect(plan.permissions).not.toContainEqual(
      expect.objectContaining({ userId: 'writer' }),
    );
  });

  it('expands group members, preserves the highest role, and reports their origin', () => {
    const plan = buildTeamSpaceMigrationPlan(
      [
        { id: 'base', workspaceId, name: '[Time] Dev', creatorId: 'owner' },
        { id: 'child', workspaceId, name: '[Dev] API', creatorId: 'owner' },
      ],
      [
        {
          spaceId: 'child',
          userId: 'reader',
          role: 'reader',
          addedById: 'owner',
          source: 'direct',
        },
        {
          spaceId: 'child',
          userId: 'reader',
          role: 'writer',
          addedById: 'admin',
          source: 'group',
        },
        {
          spaceId: 'child',
          userId: 'writer',
          role: 'writer',
          addedById: 'admin',
          source: 'group',
        },
        {
          spaceId: 'child',
          userId: 'admin',
          role: 'admin',
          addedById: 'owner',
          source: 'group',
        },
        {
          spaceId: 'child',
          userId: 'inactive',
          role: 'writer',
          addedById: 'owner',
          source: 'group',
        },
        {
          spaceId: 'child',
          userId: 'foreign',
          role: 'writer',
          addedById: 'owner',
          source: 'group',
        },
      ],
      [
        ...users(),
        {
          id: 'foreign',
          workspaceId: 'workspace-2',
          role: 'member',
          createdAt,
        },
      ],
    );

    expect(plan.errors).toEqual([]);
    expect(plan.members).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'reader', role: 'member' }),
        expect.objectContaining({ userId: 'writer', role: 'member' }),
        expect.objectContaining({ userId: 'admin', role: 'admin' }),
      ]),
    );
    expect(plan.permissions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          spaceId: 'child',
          userId: 'reader',
          canCreate: true,
          canEdit: true,
        }),
        expect.objectContaining({
          spaceId: 'child',
          userId: 'writer',
          canCreate: true,
          canEdit: true,
        }),
      ]),
    );
    expect(plan.permissions).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'admin' }),
        expect.objectContaining({ userId: 'inactive' }),
        expect.objectContaining({ userId: 'foreign' }),
      ]),
    );
    expect(plan.summaries).toContainEqual(
      expect.objectContaining({
        teamName: 'Dev',
        directMemberCount: 1,
        groupMemberCount: 3,
        effectiveMemberCount: 3,
        administratorIds: ['admin'],
        fallbackAdministratorIds: [],
      }),
    );
  });

  it.each([
    ['duplicate bases', ['[Time] Dev', '[Time] dev'], 'duplicate team bases'],
    ['missing base', ['[Dev] API'], 'references missing team base'],
    ['reserved fallback', ['[Time] General'], 'reserved General'],
    ['invalid marker', ['[Time]'], 'invalid team marker'],
  ])('reports %s without creating a partial plan', (_name, names, error) => {
    const plan = buildTeamSpaceMigrationPlan(
      names.map((name, index) => ({
        id: `space-${index}`,
        workspaceId,
        name,
        creatorId: 'owner',
      })),
      [],
      users(),
    );

    expect(plan.errors.join('\n')).toContain(error);
  });

  it('uses a workspace administrator when no direct space administrator exists', () => {
    const plan = buildTeamSpaceMigrationPlan(
      [{ id: 'base', workspaceId, name: '[Time] Dev', creatorId: null }],
      [
        {
          spaceId: 'base',
          userId: 'writer',
          role: 'writer',
          addedById: 'owner',
        },
      ],
      users(),
    );

    expect(plan.errors).toEqual([]);
    expect(plan.members).toContainEqual(
      expect.objectContaining({ userId: 'owner', role: 'admin' }),
    );
  });

  it('normalizes accents, case and excess whitespace for team references', () => {
    expect(normalizeTeamName('  Dév   Platform ')).toBe('dev platform');
  });
});
