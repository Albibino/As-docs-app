import { describe, expect, it, vi } from "vitest";
import {
  FolderImportEntryKind,
  scanFolderImportFiles,
} from "./folder-import-scanner";

describe("scanFolderImportFiles", () => {
  it("removes the selected root, classifies entries and detects duplicates", async () => {
    const files = [
      selectedFile("Endomarketing/Eventos/Comunicado.docx", 20),
      selectedFile("Endomarketing/Eventos/foto.jpg", 10),
      selectedFile("Endomarketing/Cópias/foto repetida.jpg", 10),
      selectedFile("Endomarketing/.DS_Store", 6),
      selectedFile("Endomarketing/Originais/foto.heic", 12),
    ];
    const hashFile = vi
      .fn()
      .mockResolvedValueOnce("a".repeat(64))
      .mockResolvedValueOnce("b".repeat(64))
      .mockResolvedValueOnce("b".repeat(64))
      .mockResolvedValueOnce("c".repeat(64));

    const result = await scanFolderImportFiles(files, { hashFile });

    expect(result.rootName).toBe("Endomarketing");
    expect(result.entries.map((entry) => entry.relativePath)).toEqual([
      ".DS_Store",
      "Cópias/foto repetida.jpg",
      "Eventos/Comunicado.docx",
      "Eventos/foto.jpg",
      "Originais/foto.heic",
    ]);
    expect(
      result.entries.find((entry) => entry.fileName === "Comunicado.docx"),
    ).toMatchObject({ kind: FolderImportEntryKind.Document });
    expect(
      result.entries.find((entry) => entry.fileName === "foto.heic"),
    ).toMatchObject({ kind: FolderImportEntryKind.Image });
    expect(
      result.entries.find((entry) => entry.fileName === ".DS_Store"),
    ).toMatchObject({ kind: FolderImportEntryKind.Ignored, sha256: null });
    expect(
      result.entries.find((entry) => entry.fileName === "foto repetida.jpg"),
    ).toMatchObject({
      duplicateOfPath: "Eventos/foto.jpg",
    });
    expect(result.summary).toMatchObject({
      totalEntries: 5,
      ignoredEntries: 1,
      duplicateEntries: 1,
      importableEntries: 4,
      effectiveBytes: 42,
    });
    expect(hashFile).toHaveBeenCalledTimes(4);
  });

  it("hashes one file at a time and reports deterministic progress", async () => {
    const pendingResolvers: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const hashFile = vi.fn().mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          active++;
          maximumActive = Math.max(maximumActive, active);
          pendingResolvers.push(() => {
            active--;
            resolve("d".repeat(64));
          });
        }),
    );
    const progress: number[] = [];
    const scan = scanFolderImportFiles(
      [selectedFile("Equipe/um.md", 1), selectedFile("Equipe/dois.md", 1)],
      { hashFile, onProgress: ({ completed }) => progress.push(completed) },
    );

    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    pendingResolvers.shift()!();
    await vi.waitFor(() => expect(pendingResolvers).toHaveLength(1));
    pendingResolvers.shift()!();
    await scan;

    expect(maximumActive).toBe(1);
    expect(progress).toEqual([0, 1, 2]);
  });

  it("blocks files above the per-file upload limit before hashing", async () => {
    const hashFile = vi.fn();
    const result = await scanFolderImportFiles(
      [selectedFile("Equipe/video.mp4", 101)],
      { hashFile, maxFileSize: 100 },
    );

    expect(result.blockingIssues).toEqual([
      expect.objectContaining({
        relativePath: "video.mp4",
        reason: "too-large",
      }),
    ]);
    expect(hashFile).not.toHaveBeenCalled();
  });
});

function selectedFile(relativePath: string, size: number) {
  return {
    name: relativePath.split("/").at(-1)!,
    size,
    type: "",
    webkitRelativePath: relativePath,
    arrayBuffer: vi.fn(),
  } as unknown as File;
}
