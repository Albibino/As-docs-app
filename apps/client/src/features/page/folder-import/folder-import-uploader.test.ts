import { describe, expect, it, vi } from "vitest";
import { FolderImportEntryKind } from "./folder-import-scanner";
import { uploadFolderImport } from "./folder-import-uploader";

describe("uploadFolderImport", () => {
  it("uploads only canonical files with limited concurrency and then starts processing", async () => {
    const scan = {
      rootName: "Endomarketing",
      entries: [
        entry("Eventos/a.jpg", "hash-a"),
        entry("Eventos/b.jpg", "hash-b"),
        entry("Cópias/a.jpg", "hash-a", "Eventos/a.jpg"),
        entry(".DS_Store", null, null, FolderImportEntryKind.Ignored),
      ],
      blockingIssues: [],
      summary: {
        totalEntries: 4,
        importableEntries: 3,
        ignoredEntries: 1,
        duplicateEntries: 1,
        totalBytes: 4,
        effectiveBytes: 2,
        duplicateBytes: 1,
        ignoredBytes: 1,
      },
    };
    let active = 0;
    let maximumActive = 0;
    const release: Array<() => void> = [];
    const api = {
      create: vi.fn().mockResolvedValue({ session: { id: "session-id" } }),
      getAllItems: vi.fn().mockResolvedValue([
        { id: "item-a", relativePath: "Eventos/a.jpg", status: "pending" },
        { id: "item-b", relativePath: "Eventos/b.jpg", status: "pending" },
        { id: "duplicate", relativePath: "Cópias/a.jpg", status: "duplicate" },
        { id: "ignored", relativePath: ".DS_Store", status: "ignored" },
      ]),
      uploadItem: vi.fn().mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            active++;
            maximumActive = Math.max(maximumActive, active);
            release.push(() => {
              active--;
              resolve();
            });
          }),
      ),
      start: vi.fn().mockResolvedValue({ session: { status: "processing" } }),
    };
    const progress: number[] = [];
    const uploading = uploadFolderImport(scan, "space-id", {
      api,
      concurrency: 2,
      onProgress: ({ uploaded }) => progress.push(uploaded),
    });

    await vi.waitFor(() => expect(release).toHaveLength(2));
    release.shift()!();
    release.shift()!();
    const result = await uploading;

    expect(maximumActive).toBe(2);
    expect(api.uploadItem).toHaveBeenCalledTimes(2);
    expect(api.start).toHaveBeenCalledWith("session-id");
    expect(progress).toEqual([0, 1, 2]);
    expect(result.session.id).toBe("session-id");
  });

  it("does not start processing when an upload fails", async () => {
    const scan = {
      rootName: "Equipe",
      entries: [entry("arquivo.md", "hash")],
      blockingIssues: [],
      summary: {
        totalEntries: 1,
        importableEntries: 1,
        ignoredEntries: 0,
        duplicateEntries: 0,
        totalBytes: 1,
        effectiveBytes: 1,
        duplicateBytes: 0,
        ignoredBytes: 0,
      },
    };
    const api = {
      create: vi.fn().mockResolvedValue({ session: { id: "session-id" } }),
      getAllItems: vi
        .fn()
        .mockResolvedValue([
          { id: "item-id", relativePath: "arquivo.md", status: "pending" },
        ]),
      uploadItem: vi.fn().mockRejectedValue(new Error("network error")),
      start: vi.fn(),
    };

    await expect(
      uploadFolderImport(scan, "space-id", { api, concurrency: 1 }),
    ).rejects.toThrow("network error");
    expect(api.start).not.toHaveBeenCalled();
  });

  it("resumes an uploading session without resending completed items", async () => {
    const scan = {
      rootName: "Equipe",
      entries: [entry("pronto.md", "hash-a"), entry("pendente.md", "hash-b")],
      blockingIssues: [],
      summary: {
        totalEntries: 2,
        importableEntries: 2,
        ignoredEntries: 0,
        duplicateEntries: 0,
        totalBytes: 2,
        effectiveBytes: 2,
        duplicateBytes: 0,
        ignoredBytes: 0,
      },
    };
    const api = {
      create: vi.fn(),
      getAllItems: vi.fn().mockResolvedValue([
        { id: "done", relativePath: "pronto.md", status: "uploaded" },
        { id: "pending", relativePath: "pendente.md", status: "pending" },
      ]),
      uploadItem: vi.fn(),
      start: vi.fn().mockResolvedValue({ session: { status: "processing" } }),
    };
    const progress: number[] = [];

    const result = await uploadFolderImport(scan, "space-id", {
      api,
      existingSessionId: "existing-session",
      onProgress: ({ uploaded }) => progress.push(uploaded),
    });

    expect(api.create).not.toHaveBeenCalled();
    expect(api.uploadItem).toHaveBeenCalledTimes(1);
    expect(api.uploadItem).toHaveBeenCalledWith(
      "existing-session",
      "pending",
      scan.entries[1].file,
    );
    expect(progress).toEqual([1, 2]);
    expect(result.session.id).toBe("existing-session");
  });

  it("uses the server canonical item when duplicate ordering differs", async () => {
    const scan = {
      rootName: "Equipe",
      entries: [
        entry("Cópias/a.jpg", "hash-a"),
        entry("Eventos/a.jpg", "hash-a", "Cópias/a.jpg"),
      ],
      blockingIssues: [],
      summary: {
        totalEntries: 2,
        importableEntries: 2,
        ignoredEntries: 0,
        duplicateEntries: 1,
        totalBytes: 2,
        effectiveBytes: 1,
        duplicateBytes: 1,
        ignoredBytes: 0,
      },
    };
    const api = {
      create: vi.fn().mockResolvedValue({ session: { id: "session-id" } }),
      getAllItems: vi.fn().mockResolvedValue([
        {
          id: "browser-canonical-server-duplicate",
          relativePath: "Cópias/a.jpg",
          status: "duplicate",
        },
        {
          id: "server-canonical",
          relativePath: "Eventos/a.jpg",
          status: "pending",
        },
      ]),
      uploadItem: vi.fn().mockImplementation(async (_sessionId, itemId) => {
        if (itemId === "browser-canonical-server-duplicate") {
          throw new Error("Request failed with status code 409");
        }
      }),
      start: vi.fn().mockResolvedValue({ session: { status: "processing" } }),
    };

    await expect(
      uploadFolderImport(scan, "space-id", { api, concurrency: 1 }),
    ).resolves.toBeDefined();

    expect(api.uploadItem).toHaveBeenCalledTimes(1);
    expect(api.uploadItem).toHaveBeenCalledWith(
      "session-id",
      "server-canonical",
      scan.entries[1].file,
    );
    expect(api.start).toHaveBeenCalledWith("session-id");
  });
});

function entry(
  relativePath: string,
  sha256: string | null,
  duplicateOfPath: string | null = null,
  kind = FolderImportEntryKind.Image,
) {
  return {
    file: { name: relativePath } as File,
    relativePath,
    fileName: relativePath.split("/").at(-1)!,
    fileSize: 1,
    mimeType: "application/octet-stream",
    sha256,
    kind,
    duplicateOfPath,
  };
}
