export const ASSISTED_WRITING_SESSION_TTL = 60 * 60 * 1000;

const key = (pageId: string) => `docs-assisted-writing:${pageId}`;

export function loadAssistedWritingSession<
  T extends { id: string; lastActive: number },
>(pageId: string): T | undefined {
  try {
    const saved = JSON.parse(localStorage.getItem(key(pageId)) ?? "null") as T;
    if (
      saved?.id &&
      Date.now() - saved.lastActive < ASSISTED_WRITING_SESSION_TTL
    ) {
      return saved;
    }
  } catch {
    /* invalid/expired state is ignored */
  }
  return undefined;
}

export function saveAssistedWritingSession(
  pageId: string,
  session: { id: string; lastActive: number },
) {
  localStorage.setItem(key(pageId), JSON.stringify(session));
}

export function clearAssistedWritingSession(pageId: string) {
  localStorage.removeItem(key(pageId));
}
