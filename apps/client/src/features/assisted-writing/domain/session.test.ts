import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ASSISTED_WRITING_SESSION_TTL,
  clearAssistedWritingSession,
  loadAssistedWritingSession,
  saveAssistedWritingSession,
} from "./session";

describe("assisted-writing session persistence", () => {
  beforeEach(() => localStorage.clear());

  it("survives reload/navigation inside one-hour session", () => {
    const session = {
      id: crypto.randomUUID(),
      lastActive: Date.now(),
      undo: { versionId: "v1" },
    };
    saveAssistedWritingSession("page", session);
    expect(loadAssistedWritingSession<typeof session>("page")).toEqual(session);
    clearAssistedWritingSession("page");
    expect(loadAssistedWritingSession("page")).toBeUndefined();
  });

  it("expires after one hour inactivity", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T12:00:00Z"));
    saveAssistedWritingSession("page", {
      id: "session",
      lastActive: Date.now(),
    });
    vi.advanceTimersByTime(ASSISTED_WRITING_SESSION_TTL + 1);
    expect(loadAssistedWritingSession("page")).toBeUndefined();
    vi.useRealTimers();
  });
});
