import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import type { ITeam } from "@/features/team/types/team.types";

const mocks = vi.hoisted(() => ({
  useTeamsQuery: vi.fn(),
  useAtom: vi.fn(),
  toggleMobile: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("jotai", () => ({
  useAtom: () => mocks.useAtom(),
  atom: vi.fn((value: unknown) => value),
}));

vi.mock("@/components/layouts/global/hooks/hooks/use-toggle-sidebar", () => ({
  useToggleSidebar: () => mocks.toggleMobile,
}));

vi.mock("@/features/team/queries/team-query", () => ({
  useTeamsQuery: () => mocks.useTeamsQuery(),
}));

import GlobalSidebar from "./global-sidebar";

const team = (id: string, name: string): ITeam => ({
  id,
  workspaceId: "workspace-1",
  name,
  description: null,
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  membersCount: 1,
  spacesCount: 1,
  isAdmin: false,
});

beforeAll(() => {
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
});

function renderSidebar(collapsed = false) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MantineProvider>
        <MemoryRouter initialEntries={["/home"]}>
          <GlobalSidebar collapsed={collapsed} />
        </MemoryRouter>
      </MantineProvider>
    </QueryClientProvider>,
  );
}

describe("GlobalSidebar", () => {
  beforeEach(() => {
    mocks.useAtom.mockReturnValue([false]);
    mocks.useTeamsQuery.mockReturnValue({
      data: { items: [] as ITeam[] },
      isPending: false,
    });
  });

  it("lista Times e abre o índice contextual", () => {
    mocks.useTeamsQuery.mockReturnValue({
      data: { items: [team("team-2", "Zebra"), team("team-1", "Engineering")] },
      isPending: false,
    });

    renderSidebar();

    const links = screen.getAllByRole("link");
    expect(
      links
        .find((link) => link.textContent?.includes("Engineering"))
        ?.getAttribute("href"),
    ).toBe("/spaces?teamId=team-1");
    expect(screen.getByRole("heading", { name: "Teams" })).not.toBeNull();
    expect(screen.queryByText("My spaces")).toBeNull();
  });

  it("mantém o nome do Time acessível na sidebar recolhida", () => {
    mocks.useTeamsQuery.mockReturnValue({
      data: { items: [team("team-1", "Engineering")] },
      isPending: false,
    });

    renderSidebar(true);

    expect(screen.getByLabelText("Engineering")).not.toBeNull();
  });
});
