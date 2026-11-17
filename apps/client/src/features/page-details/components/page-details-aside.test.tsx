import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageDetailsAside } from "./page-details-aside";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { PageEditMode } from "@/features/user/types/user.types.ts";

const testState = vi.hoisted(() => ({
  pageEditMode: "edit",
}));

vi.mock("@mantine/core", () => {
  const Stack = ({ children }: any) => <div>{children}</div>;
  const Group = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children }: any) => <span>{children}</span>;
  const Divider = () => <hr />;
  return { Divider, Group, Stack, Text };
});

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal()),
  useAtomValue: (atom: string) =>
    atom === "currentPageEditModeAtom" ? testState.pageEditMode : null,
}));

vi.mock("@/features/editor/atoms/editor-atoms.ts", () => ({
  currentPageEditModeAtom: "currentPageEditModeAtom",
  pageEditorAtom: "pageEditorAtom",
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ pageSlug: "page-1" }),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal()),
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/lib", () => ({
  extractPageSlugId: (value: string) => value,
}));

vi.mock("@/features/page/queries/page-query.ts", () => ({
  usePageQuery: vi.fn(),
}));

vi.mock("@/hooks/use-time-ago.tsx", () => ({
  useTimeAgo: () => "today",
}));

vi.mock("@/components/ui/custom-avatar.tsx", () => ({
  CustomAvatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/features/label/components/label-history.tsx", () => ({
  LabelHistory: ({
    pageId,
    withDivider,
  }: {
    pageId: string;
    withDivider?: boolean;
  }) => (
    <div data-testid="label-history" data-with-divider={String(withDivider)}>
      History for {pageId}
    </div>
  ),
}));

vi.mock("@/features/page-property", () => ({
  PagePropertiesEditor: ({ editable }: { editable: boolean }) => (
    <div data-testid="page-properties" data-editable={String(editable)}>
      Properties
    </div>
  ),
}));

const mockedUsePageQuery = vi.mocked(usePageQuery);

describe("PageDetailsAside", () => {
  beforeEach(() => {
    testState.pageEditMode = PageEditMode.Edit;
    mockedUsePageQuery.mockReturnValue({
      data: {
        id: "page-1",
        spaceId: "space-1",
        creator: null,
        lastUpdatedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        permissions: { canEdit: true },
      },
    } as any);
  });

  it("remove a lista de labels, restaura o histórico e preserva as propriedades", () => {
    render(<PageDetailsAside />);

    expect(screen.queryByTestId("labels-section")).toBeNull();
    expect(screen.getByTestId("label-history").textContent).toBe(
      "History for page-1",
    );
    expect(
      screen.getByTestId("label-history").getAttribute("data-with-divider"),
    ).toBe("true");
    expect(screen.getByText("Stats")).toBeTruthy();
    expect(screen.getByTestId("page-properties")).toBeTruthy();
  });

  it("mantém as propriedades somente leitura no modo Ver", () => {
    testState.pageEditMode = PageEditMode.Read;

    render(<PageDetailsAside />);

    expect(
      screen.getByTestId("page-properties").getAttribute("data-editable"),
    ).toBe("false");
  });

  it("permite alterar propriedades no modo Editar quando há permissão", () => {
    render(<PageDetailsAside />);

    expect(
      screen.getByTestId("page-properties").getAttribute("data-editable"),
    ).toBe("true");
  });

  it("mantém as propriedades somente leitura sem permissão", () => {
    mockedUsePageQuery.mockReturnValue({
      data: {
        id: "page-1",
        spaceId: "space-1",
        creator: null,
        lastUpdatedBy: null,
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        permissions: { canEdit: false },
      },
    } as any);

    render(<PageDetailsAside />);

    expect(
      screen.getByTestId("page-properties").getAttribute("data-editable"),
    ).toBe("false");
  });
});
