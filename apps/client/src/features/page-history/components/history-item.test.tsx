import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import HistoryItem from "./history-item";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/lib/time", () => ({
  formattedDate: () => "2026-09-14",
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

describe("HistoryItem", () => {
  it.each([null, undefined])(
    "renders an accessible fallback when the revision author is %s",
    (lastUpdatedBy) => {
      render(
        <MantineProvider>
          <HistoryItem
            historyItem={
              {
                id: "history-1",
                pageId: "page-1",
                title: "Saved title",
                slug: "saved-title",
                icon: "",
                coverPhoto: "",
                version: 1,
                lastUpdatedById: "removed-user",
                workspaceId: "workspace-1",
                createdAt: "2026-09-14T12:00:00.000Z",
                updatedAt: "2026-09-14T12:00:00.000Z",
                lastUpdatedBy,
                kind: "manual",
              } as any
            }
            index={0}
            onSelect={vi.fn()}
            isActive={false}
          />
        </MantineProvider>,
      );

      expect(screen.getByText("Deleted user")).toBeTruthy();
    },
  );
});
