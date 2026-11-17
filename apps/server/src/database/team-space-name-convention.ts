import { type Kysely, sql } from 'kysely';

export type LegacySpace = {
  id: string;
  workspaceId: string;
  name: string | null;
  creatorId: string | null;
};

export type LegacySpaceMember = {
  spaceId: string;
  userId: string;
  role: string;
  addedById: string | null;
  source?: 'direct' | 'group';
};

export type ActiveWorkspaceUser = {
  id: string;
  workspaceId: string;
  role: 'owner' | 'admin' | 'member';
  createdAt: Date;
};

export type PlannedSpace = {
  id: string;
  workspaceId: string;
  sourceName: string | null;
  name: string | null;
  teamKey: string;
  teamName: string;
  isTeamBase: boolean;
  creatorId: string | null;
};

export type PlannedTeam = {
  key: string;
  workspaceId: string;
  name: string;
  baseSpaceId?: string;
  baseCreatorId?: string | null;
  creatorId: string | null;
  isFallback: boolean;
};

export type PlannedTeamMember = {
  teamKey: string;
  userId: string;
  role: 'admin' | 'member';
  addedById: string | null;
};

export type PlannedSpacePermission = {
  spaceId: string;
  userId: string;
  canView: boolean;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
  grantedById: string | null;
};

export type TeamSpaceMigrationPlan = {
  spaces: PlannedSpace[];
  teams: PlannedTeam[];
  members: PlannedTeamMember[];
  permissions: PlannedSpacePermission[];
  summaries: TeamMigrationSummary[];
  errors: string[];
};

export type TeamMigrationSummary = {
  teamKey: string;
  teamName: string;
  directMemberCount: number;
  groupMemberCount: number;
  effectiveMemberCount: number;
  administratorIds: string[];
  fallbackAdministratorIds: string[];
};

const BASE_MARKER = /^\[Time\]\s+(.+?)\s*$/;
const TEAM_MARKER = /^\[([^\]]+)\]\s+(.+?)\s*$/;
const FALLBACK_TEAM_NAME = 'General';
const FALLBACK_TEAM_KEY = normalizeTeamName(FALLBACK_TEAM_NAME);

function cleanName(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}

export function normalizeTeamName(value: string): string {
  return cleanName(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('en-US');
}

function teamKey(workspaceId: string, normalizedName: string): string {
  return `${workspaceId}:${normalizedName}`;
}

function invalidMarker(space: LegacySpace): string {
  return `Space ${space.id} has an invalid team marker: ${space.name}`;
}

function roleRank(role: string): number {
  if (role === 'admin') return 3;
  if (role === 'writer') return 2;
  if (role === 'reader') return 1;
  return 0;
}

export function buildTeamSpaceMigrationPlan(
  spaces: LegacySpace[],
  memberships: LegacySpaceMember[],
  activeUsers: ActiveWorkspaceUser[],
): TeamSpaceMigrationPlan {
  const errors: string[] = [];
  const plannedSpaces: PlannedSpace[] = [];
  const teams = new Map<string, PlannedTeam>();
  const references: Array<{
    space: LegacySpace;
    teamName: string;
    spaceName: string;
  }> = [];

  for (const space of spaces) {
    const rawName = space.name ?? '';
    const baseMatch = rawName.match(BASE_MARKER);
    const teamMatch = rawName.match(TEAM_MARKER);

    if (baseMatch) {
      const name = cleanName(baseMatch[1]);
      const normalizedName = normalizeTeamName(name);
      const key = teamKey(space.workspaceId, normalizedName);

      if (normalizedName === FALLBACK_TEAM_KEY) {
        errors.push(
          `Space ${space.id} cannot create the reserved General team`,
        );
        continue;
      }
      if (teams.has(key)) {
        errors.push(
          `Workspace ${space.workspaceId} has duplicate team bases for ${name}`,
        );
        continue;
      }

      teams.set(key, {
        key,
        workspaceId: space.workspaceId,
        name,
        baseSpaceId: space.id,
        baseCreatorId: space.creatorId,
        creatorId: null,
        isFallback: false,
      });
      plannedSpaces.push({
        id: space.id,
        workspaceId: space.workspaceId,
        sourceName: space.name,
        name,
        teamKey: key,
        teamName: name,
        isTeamBase: true,
        creatorId: space.creatorId,
      });
      continue;
    }

    if (teamMatch) {
      references.push({
        space,
        teamName: cleanName(teamMatch[1]),
        spaceName: cleanName(teamMatch[2]),
      });
      continue;
    }

    if (rawName.trimStart().startsWith('[')) {
      errors.push(invalidMarker(space));
      continue;
    }

    const key = teamKey(space.workspaceId, FALLBACK_TEAM_KEY);
    if (!teams.has(key)) {
      teams.set(key, {
        key,
        workspaceId: space.workspaceId,
        name: FALLBACK_TEAM_NAME,
        creatorId: null,
        isFallback: true,
      });
    }
    plannedSpaces.push({
      id: space.id,
      workspaceId: space.workspaceId,
      sourceName: space.name,
      name: space.name,
      teamKey: key,
      teamName: FALLBACK_TEAM_NAME,
      isTeamBase: false,
      creatorId: space.creatorId,
    });
  }

  for (const reference of references) {
    const normalizedName = normalizeTeamName(reference.teamName);
    if (normalizedName === FALLBACK_TEAM_KEY) {
      errors.push(
        `Space ${reference.space.id} cannot reference the reserved General team`,
      );
      continue;
    }
    const key = teamKey(reference.space.workspaceId, normalizedName);
    const team = teams.get(key);
    if (!team || team.isFallback) {
      errors.push(
        `Space ${reference.space.id} references missing team base ${reference.teamName}`,
      );
      continue;
    }
    plannedSpaces.push({
      id: reference.space.id,
      workspaceId: reference.space.workspaceId,
      sourceName: reference.space.name,
      name: reference.spaceName,
      teamKey: key,
      teamName: team.name,
      isTeamBase: false,
      creatorId: reference.space.creatorId,
    });
  }

  const activeUsersById = new Map(activeUsers.map((user) => [user.id, user]));
  const fallbackByWorkspace = new Map<string, ActiveWorkspaceUser>();
  for (const user of activeUsers) {
    if (user.role === 'member') continue;
    const current = fallbackByWorkspace.get(user.workspaceId);
    if (
      !current ||
      (current.role === 'admin' && user.role === 'owner') ||
      (current.role === user.role && current.createdAt > user.createdAt)
    ) {
      fallbackByWorkspace.set(user.workspaceId, user);
    }
  }

  const spaceById = new Map(plannedSpaces.map((space) => [space.id, space]));
  const memberByTeamAndUser = new Map<string, PlannedTeamMember>();
  const membershipBySpaceAndUser = new Map<string, LegacySpaceMember>();
  const directMemberIdsByTeam = new Map<string, Set<string>>();
  const groupMemberIdsByTeam = new Map<string, Set<string>>();
  const fallbackAdministratorIdsByTeam = new Map<string, Set<string>>();

  for (const membership of memberships) {
    const space = spaceById.get(membership.spaceId);
    const activeUser = activeUsersById.get(membership.userId);
    if (!space || activeUser?.workspaceId !== space.workspaceId) continue;

    if (!['admin', 'writer', 'reader'].includes(membership.role)) {
      errors.push(
        `Space ${membership.spaceId} has unsupported legacy member role ${membership.role}`,
      );
      continue;
    }

    const source = membership.source ?? 'direct';
    const memberIdsBySource =
      source === 'group' ? groupMemberIdsByTeam : directMemberIdsByTeam;
    const sourceMemberIds = memberIdsBySource.get(space.teamKey) ?? new Set();
    sourceMemberIds.add(membership.userId);
    memberIdsBySource.set(space.teamKey, sourceMemberIds);

    const spaceMemberKey = `${space.id}:${membership.userId}`;
    const currentSpaceMembership = membershipBySpaceAndUser.get(spaceMemberKey);
    if (
      !currentSpaceMembership ||
      roleRank(membership.role) > roleRank(currentSpaceMembership.role)
    ) {
      membershipBySpaceAndUser.set(spaceMemberKey, membership);
    }
  }

  const permissions: PlannedSpacePermission[] = [];
  for (const membership of membershipBySpaceAndUser.values()) {
    const space = spaceById.get(membership.spaceId)!;
    const key = `${space.teamKey}:${membership.userId}`;
    const current = memberByTeamAndUser.get(key);
    const role = membership.role === 'admin' ? 'admin' : 'member';
    if (!current || role === 'admin') {
      memberByTeamAndUser.set(key, {
        teamKey: space.teamKey,
        userId: membership.userId,
        role,
        addedById: membership.addedById,
      });
    }

    if (membership.role !== 'admin') {
      permissions.push({
        spaceId: space.id,
        userId: membership.userId,
        canView: true,
        canCreate: membership.role === 'writer',
        canEdit: membership.role === 'writer',
        canDelete: false,
        grantedById: membership.addedById,
      });
    }
  }

  for (const team of teams.values()) {
    const baseCreatorIsActive = Boolean(
      team.baseCreatorId &&
      activeUsers.some(
        (user) =>
          user.id === team.baseCreatorId &&
          user.workspaceId === team.workspaceId,
      ),
    );
    const fallback = fallbackByWorkspace.get(team.workspaceId);
    team.creatorId = baseCreatorIsActive
      ? team.baseCreatorId!
      : (fallback?.id ?? null);

    if (!team.creatorId) {
      errors.push(
        `Team ${team.name} has no active creator or workspace administrator fallback`,
      );
      continue;
    }

    const hasAdmin = [...memberByTeamAndUser.values()].some(
      (member) => member.teamKey === team.key && member.role === 'admin',
    );
    if (!hasAdmin) {
      if (!fallback) {
        errors.push(
          `Team ${team.name} has no active workspace administrator fallback`,
        );
        continue;
      }
      memberByTeamAndUser.set(`${team.key}:${fallback.id}`, {
        teamKey: team.key,
        userId: fallback.id,
        role: 'admin',
        addedById: fallback.id,
      });
      fallbackAdministratorIdsByTeam.set(team.key, new Set([fallback.id]));
    }
  }

  const members = [...memberByTeamAndUser.values()];
  const memberRoleByTeamAndUser = new Map(
    members.map((member) => [
      `${member.teamKey}:${member.userId}`,
      member.role,
    ]),
  );

  const summaries = [...teams.values()].map((team) => {
    const administrators = members.filter(
      (member) => member.teamKey === team.key && member.role === 'admin',
    );
    return {
      teamKey: team.key,
      teamName: team.name,
      directMemberCount: directMemberIdsByTeam.get(team.key)?.size ?? 0,
      groupMemberCount: groupMemberIdsByTeam.get(team.key)?.size ?? 0,
      effectiveMemberCount: members.filter(
        (member) => member.teamKey === team.key,
      ).length,
      administratorIds: administrators.map((member) => member.userId),
      fallbackAdministratorIds: [
        ...(fallbackAdministratorIdsByTeam.get(team.key) ?? new Set()),
      ],
    };
  });

  return {
    spaces: plannedSpaces,
    teams: [...teams.values()],
    members,
    permissions: permissions.filter(
      (permission) =>
        memberRoleByTeamAndUser.get(
          `${spaceById.get(permission.spaceId)?.teamKey}:${permission.userId}`,
        ) === 'member',
    ),
    summaries,
    errors,
  };
}

export async function readTeamSpaceMigrationPlan(
  db: Kysely<any>,
): Promise<TeamSpaceMigrationPlan> {
  const [spacesResult, membershipsResult, usersResult] = await Promise.all([
    sql<LegacySpace>`
      SELECT id, workspace_id AS "workspaceId", name, creator_id AS "creatorId"
      FROM spaces
    `.execute(db),
    sql<LegacySpaceMember>`
      SELECT
        sm.space_id AS "spaceId",
        sm.user_id AS "userId",
        sm.role,
        sm.added_by_id AS "addedById",
        'direct' AS "source"
      FROM space_members sm
      JOIN spaces s ON s.id = sm.space_id
      JOIN users u ON u.id = sm.user_id
      WHERE sm.user_id IS NOT NULL
        AND sm.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
        AND u.workspace_id = s.workspace_id
      UNION ALL
      SELECT
        sm.space_id AS "spaceId",
        gu.user_id AS "userId",
        sm.role,
        sm.added_by_id AS "addedById",
        'group' AS "source"
      FROM space_members sm
      JOIN spaces s ON s.id = sm.space_id
      JOIN groups g
        ON g.id = sm.group_id
       AND g.workspace_id = s.workspace_id
       AND g.deleted_at IS NULL
      JOIN group_users gu ON gu.group_id = g.id
      JOIN users u ON u.id = gu.user_id
      WHERE sm.group_id IS NOT NULL
        AND sm.deleted_at IS NULL
        AND u.deleted_at IS NULL
        AND u.deactivated_at IS NULL
        AND u.workspace_id = s.workspace_id
    `.execute(db),
    sql<ActiveWorkspaceUser>`
      SELECT id, workspace_id AS "workspaceId", role, created_at AS "createdAt"
      FROM users
      WHERE deleted_at IS NULL
        AND deactivated_at IS NULL
    `.execute(db),
  ]);

  return buildTeamSpaceMigrationPlan(
    spacesResult.rows,
    membershipsResult.rows,
    usersResult.rows,
  );
}

export function assertValidTeamSpaceMigrationPlan(
  plan: TeamSpaceMigrationPlan,
): void {
  if (plan.errors.length > 0) {
    throw new Error(
      `Team migration pre-validation failed:\n${plan.errors.join('\n')}`,
    );
  }
}
