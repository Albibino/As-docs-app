import type { JSONContent } from "@tiptap/core";
import type { BlockOperation } from "../domain/assisted-writing";

export interface RecordedVersion {
  versionId: string;
  applicationId: string;
  expiresAt: string;
}

async function post(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Stores the pre-edit document as a page version, so the edit can be undone
 * server-side as well. Must succeed before the editor is changed.
 */
export async function recordApplication(input: {
  pageId: string;
  sessionId: string;
  content: JSONContent;
  operations: BlockOperation[];
  beforeHashes: Record<string, string>;
  afterHashes: Record<string, string>;
}): Promise<RecordedVersion> {
  const response = await post("/api/ai/assisted-writing/version", input);
  if (!response.ok) throw new Error("version_reference_failed");
  const body = await response.json();
  return body.data ?? body;
}

/** Tells the server the conversation is over; failures are not worth surfacing. */
export async function closeServerSession(
  pageId: string,
  sessionId: string,
): Promise<void> {
  await post("/api/ai/assisted-writing/session/end", {
    pageId,
    sessionId,
  }).catch(() => undefined);
}
