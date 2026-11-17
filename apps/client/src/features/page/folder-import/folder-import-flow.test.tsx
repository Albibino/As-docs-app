import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FolderImportEntryKind } from "./folder-import-scanner";
import { FolderImportFlow } from "./folder-import-flow";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      Object.entries(values ?? {}).reduce(
        (text, [name, value]) => text.replace(`{{${name}}}`, String(value)),
        key,
      ),
  }),
}));

describe("FolderImportFlow", () => {
  beforeEach(() => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: {
        clear: () => values.clear(),
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  it("selects a directory, presents its preview and starts the import", async () => {
    const scan = vi.fn().mockResolvedValue(scanResult());
    const upload = vi
      .fn()
      .mockImplementation(async (_scan, _spaceId, options) => {
        options.onSessionCreated("session-id");
        options.onProgress({ uploaded: 2, total: 2 });
        return { session: { id: "session-id" } };
      });
    render(
      <MantineProvider>
        <FolderImportFlow
          spaceId="space-id"
          onBack={vi.fn()}
          services={{
            scan,
            upload,
            get: vi.fn(),
            retry: vi.fn(),
            cancel: vi.fn(),
          }}
        />
      </MantineProvider>,
    );

    const input = screen.getByLabelText("Choose a folder");
    expect(input.getAttribute("webkitdirectory")).not.toBeNull();
    fireEvent.change(input, { target: { files: [{ name: "foto.jpg" }] } });

    expect(await screen.findByText("Endomarketing")).toBeTruthy();
    expect(screen.getByText("4 files")).toBeTruthy();
    expect(screen.getByText("1 duplicate")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Import folder" }));

    await waitFor(() => expect(upload).toHaveBeenCalled());
    expect(await screen.findByText("Processing folder")).toBeTruthy();
    expect(window.localStorage.getItem("docs-folder-import:space-id")).toBe(
      "session-id",
    );
  });

  it("blocks confirmation when a selected file exceeds 100 MB", async () => {
    const scan = vi.fn().mockResolvedValue({
      ...scanResult(),
      blockingIssues: [
        {
          relativePath: "video.mp4",
          reason: "too-large",
          fileSize: 101 * 1024 * 1024,
        },
      ],
    });
    render(
      <MantineProvider>
        <FolderImportFlow
          spaceId="space-id"
          onBack={vi.fn()}
          services={{
            scan,
            upload: vi.fn(),
            get: vi.fn(),
            retry: vi.fn(),
            cancel: vi.fn(),
          }}
        />
      </MantineProvider>,
    );

    fireEvent.change(screen.getByLabelText("Choose a folder"), {
      target: { files: [{ name: "video.mp4" }] },
    });

    expect(await screen.findByText("1 file exceeds 100 MB")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "Import folder",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("rejects a different folder without scanning it", async () => {
    const scan = vi.fn();
    window.localStorage.setItem("docs-folder-import:space-id", "session-id");
    render(
      <MantineProvider>
        <FolderImportFlow
          spaceId="space-id"
          onBack={vi.fn()}
          services={{
            scan,
            upload: vi.fn(),
            get: vi.fn().mockResolvedValue(pendingUploadResult()),
            retry: vi.fn(),
            cancel: vi.fn(),
          }}
        />
      </MantineProvider>,
    );

    expect(await screen.findByText("Upload ready to resume")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Choose a folder"), {
      target: {
        files: [{ name: "a.md", webkitRelativePath: "Outra pasta/a.md" }],
      },
    });

    expect(
      await screen.findByText(
        "Choose the same folder to resume this upload, or discard it to start a new import.",
      ),
    ).toBeTruthy();
    expect(scan).not.toHaveBeenCalled();
  });

  it("discards a pending upload so another folder can be imported", async () => {
    const cancel = vi.fn().mockResolvedValue({
      session: { ...pendingUploadResult().session, status: "cancelled" },
      report: {},
    });
    window.localStorage.setItem("docs-folder-import:space-id", "session-id");
    render(
      <MantineProvider>
        <FolderImportFlow
          spaceId="space-id"
          onBack={vi.fn()}
          services={{
            scan: vi.fn().mockResolvedValue(scanResult()),
            upload: vi.fn(),
            get: vi.fn().mockResolvedValue(pendingUploadResult()),
            retry: vi.fn(),
            cancel,
          }}
        />
      </MantineProvider>,
    );

    fireEvent.click(
      await screen.findByRole("button", {
        name: "Discard this upload and import another folder",
      }),
    );

    await waitFor(() => expect(cancel).toHaveBeenCalledWith("session-id"));
    await waitFor(() =>
      expect(screen.queryByText("Upload ready to resume")).toBeNull(),
    );
    expect(window.localStorage.getItem("docs-folder-import:space-id")).toBeNull();

    fireEvent.change(screen.getByLabelText("Choose a folder"), {
      target: {
        files: [{ name: "a.md", webkitRelativePath: "Outra pasta/a.md" }],
      },
    });
    expect(await screen.findByText("Endomarketing")).toBeTruthy();
  });
});

function pendingUploadResult() {
  return {
    session: {
      id: "session-id",
      fileName: "Second Brain",
      spaceId: "space-id",
      workspaceId: "workspace-id",
      status: "uploading",
      errorMessage: null,
    },
    report: {
      total: 900,
      pending: 900,
      uploaded: 0,
      processing: 0,
      imported: 0,
      failed: 0,
      ignored: 0,
      duplicates: 0,
    },
  };
}

function scanResult() {
  return {
    rootName: "Endomarketing",
    entries: [
      {
        file: { name: "a.jpg" } as File,
        relativePath: "Eventos/a.jpg",
        fileName: "a.jpg",
        fileSize: 20,
        mimeType: "image/jpeg",
        sha256: "a".repeat(64),
        kind: FolderImportEntryKind.Image,
        duplicateOfPath: null,
      },
    ],
    blockingIssues: [],
    summary: {
      totalEntries: 4,
      importableEntries: 3,
      ignoredEntries: 1,
      duplicateEntries: 1,
      totalBytes: 48,
      effectiveBytes: 42,
      duplicateBytes: 1,
      ignoredBytes: 5,
    },
  };
}
