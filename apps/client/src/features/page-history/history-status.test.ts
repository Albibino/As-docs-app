import { describe, expect, it } from "vitest";
import { getHistoryItemStatus } from "./history-status";

describe("history revision status", () => {
  it("derives the status only from the revision kind", () => {
    const pointers = { currentRevisionId: "revision-1" };
    expect(getHistoryItemStatus("current-draft", pointers, "draft")).toEqual({
      isDraft: true,
      isManual: false,
      isAutomatic: false,
    });
    expect(getHistoryItemStatus("revision-1", pointers, "manual")).toEqual({
      isDraft: false,
      isManual: true,
      isAutomatic: false,
    });
    expect(getHistoryItemStatus("revision-2", pointers, "automatic")).toEqual({
      isDraft: false,
      isManual: false,
      isAutomatic: true,
    });
  });
});
