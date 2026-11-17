import { useCallback, useEffect, useState } from "react";
import {
  clearAssistedWritingSession,
  loadAssistedWritingSession,
  saveAssistedWritingSession,
} from "../domain/session";
import type { GenerationBlock } from "../domain/assisted-writing";
import type { ChatTurn, UndoRecord, WritingSession } from "../types";

function freshSession(): WritingSession {
  return { id: crypto.randomUUID(), lastActive: Date.now(), history: [] };
}

/**
 * Conversation of one page. It survives reloads (localStorage, one hour of
 * inactivity) so the model keeps context and the undo record stays reachable.
 * The caller remounts it per page, so `pageId` never changes under it.
 */
export function useWritingSession(pageId: string) {
  const [session, setSession] = useState<WritingSession>(
    () => loadAssistedWritingSession<WritingSession>(pageId) ?? freshSession(),
  );

  useEffect(() => {
    saveAssistedWritingSession(pageId, session);
  }, [pageId, session]);

  const recordTurn = useCallback(
    (turn: [ChatTurn, ChatTurn], baseline: GenerationBlock[]) =>
      setSession((current) => ({
        ...current,
        lastActive: Date.now(),
        baseline: current.baseline ?? baseline,
        history: [...current.history, ...turn],
      })),
    [],
  );

  const setUndo = useCallback(
    (undo: UndoRecord | undefined) =>
      setSession((current) => ({
        ...current,
        lastActive: undo ? Date.now() : current.lastActive,
        undo,
      })),
    [],
  );

  /** Forgets the conversation locally and starts a new one. */
  const restart = useCallback(() => {
    clearAssistedWritingSession(pageId);
    setSession(freshSession());
  }, [pageId]);

  return { session, recordTurn, setUndo, restart };
}
