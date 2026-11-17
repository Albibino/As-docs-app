import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWorkspace } from "@/features/workspace/types/workspace.types.ts";

const mocks = vi.hoisted(() => ({
  workspace: {
    id: "workspace-1",
    settings: {},
  } as unknown as IWorkspace,
  setWorkspace: vi.fn(),
  updateWorkspace: vi.fn(),
  uploadPdfExportAsset: vi.fn(),
  deletePdfExportAsset: vi.fn(),
  deferThemeUpdates: false,
  deferredThemeUpdates: [] as Array<() => void>,
}));

vi.mock("react", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initialValue: unknown) => {
      const [value, setValue] = actual.useState(initialValue);
      const isPdfTheme =
        typeof value === "object" &&
        value !== null &&
        "cover" in value &&
        "page" in value &&
        "footer" in value;

      if (!isPdfTheme) {
        return [value, setValue] as const;
      }

      return [
        value,
        (nextValue: unknown) => {
          if (mocks.deferThemeUpdates) {
            mocks.deferredThemeUpdates.push(() =>
              setValue(nextValue as never),
            );
          } else {
            setValue(nextValue as never);
          }
        },
      ] as const;
    },
  };
});

vi.mock("@mantine/core", () => {
  const textInput = ({
    label,
    value,
    onChange,
    description,
  }: {
    label: string;
    value: string;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
    description?: string;
  }) => (
    <label>
      {label}
      <input aria-label={label} value={value} onChange={onChange} />
      {description && <span>{description}</span>}
    </label>
  );
  const switchInput = ({
    label,
    checked,
    onChange,
  }: {
    label: string;
    checked: boolean;
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  }) => (
    <label>
      {label}
      <input
        aria-label={label}
        type="checkbox"
        checked={checked}
        onChange={onChange}
      />
    </label>
  );
  const container = ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  );

  return {
    Button: ({ children, onClick }: any) => (
      <button onClick={onClick}>{children}</button>
    ),
    ColorInput: textInput,
    Divider: () => <hr />,
    FileInput: ({ label, onChange, description, disabled }: any) => (
      <label>
        {label}
        <input
          aria-label={label}
          type="file"
          disabled={disabled}
          onChange={(event) => onChange(event.currentTarget.files?.[0] ?? null)}
        />
        {description && <span>{description}</span>}
      </label>
    ),
    Group: container,
    NumberInput: textInput,
    Select: textInput,
    Stack: container,
    Switch: switchInput,
    Text: container,
    TextInput: textInput,
  };
});

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal()),
  useAtom: () => [mocks.workspace, mocks.setWorkspace],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/user/atoms/current-user-atom.ts", () => ({
  workspaceAtom: "workspaceAtom",
}));

vi.mock("@/features/workspace/services/workspace-service.ts", () => ({
  updateWorkspace: mocks.updateWorkspace,
  uploadPdfExportAsset: mocks.uploadPdfExportAsset,
  deletePdfExportAsset: mocks.deletePdfExportAsset,
}));

vi.mock("@/hooks/use-user-role.tsx", () => ({
  default: () => ({ isAdmin: true }),
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: vi.fn() },
}));

import WorkspacePdfExportSettings from "./workspace-pdf-export-settings";

const flushDeferredThemeUpdates = () => {
  act(() => {
    mocks.deferredThemeUpdates.splice(0).forEach((update) => update());
  });
};

describe("WorkspacePdfExportSettings", () => {
  beforeEach(() => {
    mocks.deferThemeUpdates = false;
    mocks.deferredThemeUpdates = [];
    mocks.updateWorkspace.mockClear();
    mocks.uploadPdfExportAsset.mockReset();
    mocks.deletePdfExportAsset.mockReset();
    mocks.workspace = {
      id: "workspace-1",
      settings: {},
    } as unknown as IWorkspace;
  });

  it.each(["Show cover", "Show page number"])(
    "permite alternar %s sem quebrar a página",
    async (label) => {
      render(<WorkspacePdfExportSettings />);
      mocks.deferThemeUpdates = true;
      const toggle = screen.getByRole("checkbox", { name: label });

      fireEvent.click(toggle);
      flushDeferredThemeUpdates();

      expect((toggle as HTMLInputElement).checked).toBe(label === "Show page number");
    },
  );

  it("removes duplicate image URL fields and keeps image uploads", () => {
    render(<WorkspacePdfExportSettings />);

    expect(
      screen.queryByRole("textbox", { name: "Cover background image URL" }),
    ).toBeNull();
    expect(
      screen.queryByRole("textbox", { name: "Page background image URL" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Upload cover background image"),
    ).toHaveProperty("type", "file");
    expect(
      screen.getByLabelText("Upload page background image"),
    ).toHaveProperty("type", "file");
  });

  it("uploads a cover image only when Save is clicked and persists its asset ID", async () => {
    const coverImage = new File(["png bytes"], "cover.png", {
      type: "image/png",
    });
    mocks.uploadPdfExportAsset.mockResolvedValue({
      assetId: "3f5048a2-3883-4da3-87e7-a841f5c3f89a.png",
    });
    mocks.updateWorkspace.mockResolvedValue(mocks.workspace);

    render(<WorkspacePdfExportSettings />);

    fireEvent.change(screen.getByLabelText("Upload cover background image"), {
      target: { files: [coverImage] },
    });

    expect(mocks.uploadPdfExportAsset).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.uploadPdfExportAsset).toHaveBeenCalledWith(coverImage);
    expect(mocks.updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfExport: expect.objectContaining({
          cover: expect.objectContaining({
            backgroundAssetId: "3f5048a2-3883-4da3-87e7-a841f5c3f89a.png",
          }),
        }),
      }),
    );
  });

  it("removes a saved image only after the updated theme is saved", async () => {
    const oldCoverAssetId = "3f5048a2-3883-4da3-87e7-a841f5c3f89a.png";
    mocks.workspace = {
      id: "workspace-1",
      settings: {
        pdfExport: {
          cover: { backgroundAssetId: oldCoverAssetId },
        },
      },
    } as unknown as IWorkspace;
    mocks.updateWorkspace.mockResolvedValue(mocks.workspace);

    render(<WorkspacePdfExportSettings />);
    fireEvent.click(screen.getByRole("button", { name: "Remove cover image" }));

    expect(mocks.deletePdfExportAsset).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.updateWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({
        pdfExport: expect.objectContaining({
          cover: expect.objectContaining({ backgroundAssetId: null }),
        }),
      }),
    );
    expect(mocks.deletePdfExportAsset).toHaveBeenCalledWith(oldCoverAssetId);
  });

  it("cleans up a newly uploaded asset if saving the theme fails", async () => {
    const coverImage = new File(["png bytes"], "cover.png", {
      type: "image/png",
    });
    const uploadedAssetId = "3f5048a2-3883-4da3-87e7-a841f5c3f89a.png";
    mocks.uploadPdfExportAsset.mockResolvedValue({ assetId: uploadedAssetId });
    mocks.updateWorkspace.mockRejectedValue(new Error("save failed"));

    render(<WorkspacePdfExportSettings />);
    fireEvent.change(screen.getByLabelText("Upload cover background image"), {
      target: { files: [coverImage] },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.deletePdfExportAsset).toHaveBeenCalledWith(uploadedAssetId);
  });

  it("keeps the cover upload and exposes one full-page background control", () => {
    render(<WorkspacePdfExportSettings />);

    expect(
      screen.getByLabelText("Upload cover background image"),
    ).toHaveProperty("type", "file");
    expect(
      screen.queryByRole("textbox", { name: "Page background image URL" }),
    ).toBeNull();
    expect(
      screen.getByLabelText("Upload page background image"),
    ).toHaveProperty("type", "file");
    expect(
      screen.queryByLabelText("Upload decoration image"),
    ).toBeNull();
    expect(screen.queryByRole("textbox", { name: "Footer text" })).toBeNull();
  });

  it("restores the Soyotec defaults without saving until Save is clicked", async () => {
    mocks.workspace = {
      id: "workspace-1",
      settings: {
        pdfExport: {
          page: { fontFamily: "Verdana", fontSize: 18 },
          colors: { primary: "#123456" },
          title: { fontSize: 38 },
          cover: { enabled: false, backgroundAsset: "https://example.com/old.png" },
          decoration: { enabled: false, asset: "https://example.com/old-decoration.png" },
          footer: { enabled: false, text: "Custom footer", showPageNumber: true },
        },
      },
    } as unknown as IWorkspace;

    render(<WorkspacePdfExportSettings />);

    fireEvent.click(screen.getByRole("button", { name: "Restore defaults" }));

    expect(screen.getByRole("textbox", { name: "Font" })).toHaveProperty(
      "value",
      "Calibri",
    );
    expect(screen.getByRole("textbox", { name: "Body font size" })).toHaveProperty(
      "value",
      "12",
    );
    expect(screen.getByRole("textbox", { name: "Title font size" })).toHaveProperty(
      "value",
      "26",
    );
    expect((screen.getByRole("checkbox", { name: "Show cover" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("checkbox", { name: "Show page number" }) as HTMLInputElement).checked).toBe(false);
    expect(mocks.updateWorkspace).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
    });

    expect(mocks.updateWorkspace).toHaveBeenCalledWith({
      pdfExport: {
        page: {
          size: "A4",
          margins: { top: 25, right: 25, bottom: 25, left: 30 },
          fontFamily: "Calibri",
          fontSize: 12,
          lineHeight: 1.15,
          backgroundAsset: null,
          backgroundAssetId: null,
        },
        colors: {
          primary: "#00A8B5",
          secondary: "#6F6F6F",
          text: "#000000",
          coverBackground: "#FFFFFF",
          coverText: "#000000",
          tableHeaderBackground: "#00A8B5",
          tableHeaderText: "#FFFFFF",
        },
        title: { fontSize: 26, uppercase: true, color: "#000000", alignment: "left" },
        headings: { fontSize: 14, uppercase: true, color: "#00A8B5" },
        cover: {
          enabled: true,
          backgroundAsset: null,
          backgroundAssetId: null,
        },
        footer: { showPageNumber: false },
      },
    });
  });
});
