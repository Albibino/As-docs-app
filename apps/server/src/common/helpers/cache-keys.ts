export const CacheKey = {
  LICENSE_VALID: (workspaceId: string) => `license:valid:${workspaceId}`,
  SPACE_ROLES: (userId: string, spaceId: string) =>
    `perm:space-roles:${userId}:${spaceId}`,
};

// Permission caches dedupe repeated checks within and across short request bursts.
// 5s keeps staleness on revocations bounded.
export const PERMISSION_CACHE_TTL_MS = 5_000;
