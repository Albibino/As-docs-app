import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import HistoryModalMobile from "./history-modal-mobile";

const { historySelection, restoreState } = vi.hoisted(() => ({
  historySelection: { activeId: "history-1" },
  restoreState: { pending: true },
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

vi.mock("@/features/page-history/hooks", () => ({
  useCurrentPageDraft: () => ({
    draft: {
      id: "current-page-draft",
      pageId: "page-1",
      title: "Draft",
      createdAt: "2026-09-14T00:00:00.000Z",
      kind: "draft",
    },
  }),
  useHistoryReset: vi.fn(),
  useHistoryRestore: () => ({
    canRestore: true,
    confirmRestore: vi.fn(),
    isRestoring: restoreState.pending,
    isRestoreDisabled: restoreState.pending,
  }),
  useDiffNavigation: () => ({
    currentChangeIndex: 0,
    handlePrevChange: vi.fn(),
    handleNextChange: vi.fn(),
  }),
}));

vi.mock("@/features/page-history/queries/page-history-query", () => ({
  usePageHistoryListQuery: () => ({
    data: {
      pages: [
        {
          items: [
            {
              id: "history-1",
              pageId: "page-1",
              title: "Saved",
              createdAt: "2026-09-13T00:00:00.000Z",
              kind: "automatic",
              contributors: [],
              lastUpdatedBy: null,
            },
          ],
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
}));

vi.mock("@/features/page-history/components/history-view", () => ({
  default: () => <div>Version preview</div>,
}));

vi.mock("@/lib/time", () => ({ formattedDate: () => "2026-09-13" }));

describe("HistoryModalMobile", () => {
  beforeEach(() => {
    restoreState.pending = true;
  });

  it("disables the restore action and exposes its loading label while pending", () => {
    render(
      <MantineProvider>
        <HistoryModalMobile pageId="page-1" />
      </MantineProvider>,
    );

    expect(
      screen.getByRole("button", { name: "Restoring version" }),
    ).toHaveProperty("disabled", true);
  });
});
