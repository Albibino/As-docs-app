/**
 * A label or label tree is owned by exactly one scope: the workspace, or a
 * single space. Anything at or below the owning scope may use it.
 *
 * `LabelScope` is the resolved set of scopes visible from a vantage point —
 * "which labels can this page use?" — and is the only place that knowledge
 * lives. Repos filter with it; nothing else reasons about the hierarchy.
 */
export type LabelScope = {
  workspaceId: string;

  /**
   * Spaces whose labels are in reach. Today this is at most the one space
   * being looked at. When spaces gain parents, this becomes the full ancestor
   * chain (root first) and every caller inherits nesting for free.
   */
  spaceIds: string[];
};

/**
 * Resolves what a page inside `spaceId` can see: workspace-level labels plus
 * the space's own.
 *
 * Deliberately async even though it does no I/O yet — resolving ancestors will
 * need a query, and keeping the signature stable means sub-spaces won't ripple
 * through every call site.
 */
export async function resolveLabelScope(
  workspaceId: string,
  spaceId?: string | null,
): Promise<LabelScope> {
  return {
    workspaceId,
    spaceIds: spaceId ? [spaceId] : [],
  };
}

/**
 * The scope a newly created label or tree is written to. `spaceId` NULL means
 * workspace-wide.
 */
export type LabelOwnerScope = {
  workspaceId: string;
  spaceId: string | null;
};

/**
 * Whether something owned by `owner` may be used from `scope`. Callers use this
 * to reject a label id that belongs to a space the page cannot see, which the
 * database alone would happily accept.
 */
export function isInLabelScope(
  owner: { workspaceId: string; spaceId: string | null },
  scope: LabelScope,
): boolean {
  if (owner.spaceId === null) {
    return owner.workspaceId === scope.workspaceId;
  }
  return scope.spaceIds.includes(owner.spaceId);
}
