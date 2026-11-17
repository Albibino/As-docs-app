import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryModalBody from "./history-modal-body";
import HistoryModalMobile from "./history-modal-mobile";

const desktopStyles = readFileSync(
  resolve(
    process.cwd(),
    "src/features/page-history/components/css/history.module.css",
  ),
  "utf8",
);
const mobileStyles = readFileSync(
  resolve(
    process.cwd(),
    "src/features/page-history/components/css/history-mobile.module.css",
  ),
  "utf8",
);
const modalSource = readFileSync(
  resolve(
    process.cwd(),
    "src/features/page-history/components/history-modal.tsx",
  ),
  "utf8",
);

const { historySelection, restoreState } = vi.hoisted(() => ({
  historySelection: {
    activeId: "current-page-draft",
    previousId: "",
  },
  restoreState: { pending: false },
}));

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);

const { pageHistoryItems } = vi.hoisted(() => ({
  pageHistoryItems: [
    {
      id: "history-without-author",
      pageId: "page-1",
      title: "Saved title",
      slug: "saved-title",
      icon: "",
      coverPhoto: "",
      version: 1,
      lastUpdatedById: "removed-user",
      workspaceId: "workspace-1",
      createdAt: "2026-09-12T00:00:00.000Z",
      updatedAt: "2026-09-12T00:00:00.000Z",
      lastUpdatedBy: null,
      kind: "manual",
    },
  ],
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("jotai", () => ({
  atom: () => Symbol("atom"),
  useAtom: (atom: string) =>
    atom === "active-history-id"
      ? [historySelection.activeId, vi.fn()]
      : [false, vi.fn()],
  useAtomValue: (atom: string) => {
    if (atom === "active-history-id") return historySelection.activeId;
    if (atom === "active-history-prev-id") return historySelection.previousId;
    if (atom === "current-user") return { id: "user-1" };
    if (atom === "workspace") return { settings: { sharing: {} } };
    return null;
  },
  useSetAtom: () => vi.fn(),
}));

vi.mock("@/features/page-history/atoms/history-atoms", () => ({
  activeHistoryIdAtom: "active-history-id",
  activeHistoryPrevIdAtom: "active-history-prev-id",
  diffCountsAtom: "diff-counts",
  highlightChangesAtom: "highlight-changes",
  historyAtoms: "history-modal",
}));

vi.mock("@/features/page-history/queries/page-history-query", () => ({
  usePageHistoryListQuery: () => ({
    data: {
      pages: [
        {
          items: pageHistoryItems,
          currentRevisionId: null,
          publishedRevisionId: null,
        },
      ],
    },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  usePageHistoryQuery: () => ({
    data: { title: "Draft", content: {} },
    isLoading: false,
    isError: false,
  }),
  usePrepareHistoryRestoreMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: restoreState.pending,
  }),
  prefetchPageHistory: vi.fn(),
}));

vi.mock("@/lib/time", () => ({
  formattedDate: () => "2026-09-12",
}));

vi.mock("@/features/page-history/components/history-view", () => ({
  default: () => <div>Version preview</div>,
}));

vi.mock("@/features/page/queries/page-query", () => ({
  usePageQuery: () => ({
    data: {
      id: "page-1",
      creatorId: "user-1",
      title: "Draft",
      content: "{}",
      updatedAt: "2026-09-12T00:00:00.000Z",
      canEdit: true,
      permissions: { canEdit: true, hasRestriction: false },
    },
  }),
  useUpdateTitlePageMutation: () => ({
    mutateAsync: vi.fn(),
    isPending: false,
  }),
}));

vi.mock("@/features/space/queries/space-query", () => ({
  useSpaceQuery: () => ({
    data: {
      permission: { source: "explicit", canEdit: true },
      settings: { sharing: { disabled: false } },
    },
  }),
}));

vi.mock("@/features/user/atoms/current-user-atom", () => ({
  userAtom: "current-user",
  workspaceAtom: "workspace",
}));


vi.mock("react-router-dom", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useParams: () => ({ pageSlug: "page-1", spaceSlug: "space-1" }),
}));

function renderDesktop({ width = 640, height = 360 } = {}) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });

  return render(
    <div style={{ width, height }}>
      <MantineProvider>
        <HistoryModalBody pageId="page-1" />
      </MantineProvider>
    </div>,
  );
}

function renderMobile({ width = 320, height = 360 } = {}) {
  Object.defineProperty(window, "innerWidth", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(window, "innerHeight", {
    configurable: true,
    value: height,
  });

  return render(
    <div style={{ width, height }}>
      <MantineProvider>
        <HistoryModalMobile pageId="page-1" />
      </MantineProvider>
    </div>,
  );
}

// TCC: a barra superior do histórico (Salvar versão) foi removida; as versões
// são só as automáticas.
function expectNoTopActionBar() {
  expect(screen.queryByRole("button", { name: "Save version" })).toBeNull();
  expect(document.querySelector('[class*="historyActionBar"]')).toBeNull();
}

describe("history modal action layout", () => {
  beforeEach(() => {
    historySelection.activeId = "current-page-draft";
    historySelection.previousId = "";
    restoreState.pending = false;
  });

  it("keeps desktop save and restore actions accessible when space is constrained", () => {
    renderDesktop();

    expectNoTopActionBar();
    // TCC: publicação de páginas removida.
    expect(screen.queryByText("Public sharing")).toBeNull();
    expect(screen.getByText("Current draft")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("centers the desktop modal within the viewport", () => {
    expect(modalSource).toContain("centered");
    expect(modalSource).toContain('justifyContent: "center"');
    expect(modalSource).toContain('alignItems: "center"');
    expect(modalSource).toContain('marginInline: "auto"');
  });

  it("keeps the desktop modal vertically centered without clipping the header", () => {
    expect(modalSource).not.toContain('yOffset="1rem"');
    expect(modalSource).toContain('height: "min(900px, calc(100dvh - 3rem))"');
    expect(modalSource).toContain('maxHeight: "calc(100dvh - 3rem)"');
    expect(modalSource).toContain('paddingBlock: "1.5rem"');
  });

  it("keeps the content layout out of Modal.Content style (Mantine copies it to inner)", () => {
    // O Mantine 9 aplica o `style` do Modal.Content também ao `inner`; altura e
    // direção do flex ali tiravam o modal do centro e cortavam o cabeçalho.
    expect(modalSource).not.toMatch(/<Modal\.Content\s+style=/);
    expect(modalSource).toContain("<Modal.Content>");
  });

  it("has no top action bar (save version or publication)", () => {
    renderDesktop({ width: 1280, height: 800 });
    expectNoTopActionBar();
    expect(screen.queryByText("Public sharing")).toBeNull();
    expect(desktopStyles).not.toContain(".historyActionBar");
    expect(mobileStyles).not.toContain(".historyActionBar");
  });

  it("keeps mobile save and restore actions accessible without a nowrap row", () => {
    renderMobile();

    expectNoTopActionBar();
    // TCC: publicação de páginas removida.
    expect(screen.queryByText("Public sharing")).toBeNull();
    expect(screen.getByText("Current draft")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("shows the deleted-user fallback for a mobile revision option", () => {
    renderMobile();

    fireEvent.click(screen.getByRole("combobox"));

    expect(screen.getByText("Deleted user")).toBeTruthy();
  });

  it("keeps the difference bar and restore actions reachable in low viewports", () => {
    historySelection.activeId = "history-without-author";
    historySelection.previousId = "current-page-draft";

    const desktop = renderDesktop({ width: 640, height: 360 });
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByText("Highlight changes")).toBeTruthy();
    desktop.unmount();

    renderMobile({ width: 320, height: 360 });
    expect(screen.getByRole("button", { name: "Restore" })).toBeTruthy();
    expect(screen.getByText("Highlight changes")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Expand public sharing settings" }),
    ).toBeNull();
  });

  it("disables the desktop restore action while restoration is pending", () => {
    historySelection.activeId = "history-without-author";
    historySelection.previousId = "current-page-draft";
    restoreState.pending = true;

    renderDesktop();

    expect(
      screen.getByRole("button", { name: "Restoring version" }),
    ).toHaveProperty("disabled", true);
  });
});
