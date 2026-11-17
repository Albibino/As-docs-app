import type { ISpace } from "@/features/space/types/space.types";
import type { ITeam } from "@/features/team/types/team.types";

export type DocsRouteContext =
  | { kind: "team-directory" }
  | { kind: "team-spaces"; teamId: string }
  | { kind: "space"; teamId: string; spaceSlug: string }
  | { kind: "empty" };

export type LastDocsContext = {
  teamId: string;
  spaceSlug: string;
};

type StoredDocsContext = LastDocsContext | string | null;

function isLastDocsContext(value: unknown): value is LastDocsContext {
  if (!value || typeof value !== "object") return false;

  const context = value as Partial<LastDocsContext>;
  return (
    typeof context.teamId === "string" &&
    context.teamId.length > 0 &&
    typeof context.spaceSlug === "string" &&
    context.spaceSlug.length > 0
  );
}

function getAccessibleSpaces(teams: ITeam[], spaces: ISpace[]) {
  const accessibleTeamIds = new Set(teams.map((team) => team.id));

  return spaces.filter(
    (space) => !space.archivedAt && accessibleTeamIds.has(space.teamId),
  );
}

function findContextSpace(
  context: Exclude<StoredDocsContext, null>,
  spaces: ISpace[],
) {
  if (typeof context === "string") {
    return spaces.find((space) => space.slug === context);
  }

  return spaces.find(
    (space) =>
      space.teamId === context.teamId && space.slug === context.spaceSlug,
  );
}

export function resolveDocsEntryTarget(input: {
  isWorkspaceAdmin: boolean;
  teams: ITeam[];
  spaces: ISpace[];
  lastContext?: StoredDocsContext;
}): DocsRouteContext {
  if (input.isWorkspaceAdmin) return { kind: "team-directory" };

  const firstAdministratedTeam = input.teams.find((team) => team.isAdmin);
  if (firstAdministratedTeam) {
    return { kind: "team-spaces", teamId: firstAdministratedTeam.id };
  }

  const accessibleSpaces = getAccessibleSpaces(input.teams, input.spaces);
  const restoredSpace = input.lastContext
    ? findContextSpace(input.lastContext, accessibleSpaces)
    : undefined;
  const targetSpace = restoredSpace ?? accessibleSpaces[0];

  return targetSpace
    ? {
        kind: "space",
        teamId: targetSpace.teamId,
        spaceSlug: targetSpace.slug,
      }
    : { kind: "empty" };
}

function getDocsContextStorageKey(workspaceId: string, userId: string) {
  return `docs:last-context:${workspaceId}:${userId}`;
}

export function readLastDocsContext(
  workspaceId: string | undefined,
  userId: string | undefined,
): StoredDocsContext {
  if (!workspaceId || !userId) return null;

  try {
    const storedValue = window.localStorage.getItem(
      getDocsContextStorageKey(workspaceId, userId),
    );
    if (!storedValue) return null;

    try {
      const parsedValue: unknown = JSON.parse(storedValue);
      return isLastDocsContext(parsedValue) ? parsedValue : null;
    } catch {
      return storedValue.trim() ? storedValue : null;
    }
  } catch {
    return null;
  }
}

export function rememberLastDocsContext(input: {
  workspaceId: string | undefined;
  userId: string | undefined;
  context: LastDocsContext;
  teams: ITeam[];
  spaces: ISpace[];
}): boolean {
  if (!input.workspaceId || !input.userId) return false;

  const validSpace = getAccessibleSpaces(input.teams, input.spaces).some(
    (space) =>
      space.teamId === input.context.teamId &&
      space.slug === input.context.spaceSlug,
  );
  if (!validSpace) return false;

  try {
    window.localStorage.setItem(
      getDocsContextStorageKey(input.workspaceId, input.userId),
      JSON.stringify(input.context),
    );
    return true;
  } catch {
    return false;
  }
}
