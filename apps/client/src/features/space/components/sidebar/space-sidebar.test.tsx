import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISpace } from "@/features/space/types/space.types.ts";

const mocks = vi.hoisted(() => ({
  useGetSpaceBySlugQuery: vi.fn(),
  useTeamQuery: vi.fn(),
  useTeamsQuery: vi.fn(),
  handleCreate: vi.fn(),
  toggleMobileSidebar: vi.fn(),
  rememberLastDocsContext: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
vi.mock("@/lib/config.ts", () => ({
  getSpaceSettingsUrl: (spaceSlug: string) => `/s/${spaceSlug}/settings`,
  getSpaceUrl: (spaceSlug: string) => `/s/${spaceSlug}`,
}));
vi.mock("jotai", () => ({
  useAtom: () => [false, vi.fn()],
  useAtomValue: () => undefined,
}));
vi.mock("@/features/space/queries/space-query.ts", () => ({
  useGetSpaceBySlugQuery: (...args: unknown[]) =>
    mocks.useGetSpaceBySlugQuery(...args),
}));
vi.mock("@/features/team/queries/team-query", () => ({
  useTeamQuery: (...args: unknown[]) => mocks.useTeamQuery(...args),
  useTeamsQuery: (...args: unknown[]) => mocks.useTeamsQuery(...args),
}));
vi.mock("@/features/page/tree/hooks/use-tree-mutation.ts", () => ({
  useTreeMutation: () => ({ handleCreate: mocks.handleCreate }),
}));
vi.mock("@/features/page/tree/components/space-tree.tsx", () => ({
  default: () => <div>Space tree</div>,
}));
vi.mock("@/features/team/components/team-switcher", () => ({
  TeamSwitcher: () => <div>Team switcher</div>,
}));
vi.mock("./space-switcher", () => ({
  SpaceSwitcher: () => <div>Space switcher</div>,
}));
vi.mock("@/features/favorite/components/sidebar-favorites", () => ({
  SidebarFavorites: () => <div>Favorites</div>,
  SidebarFavoritesCollapsed: () => <div>Collapsed favorites</div>,
}));
vi.mock("@/components/layouts/global/collapsed-section-popover", () => ({
  CollapsedSectionPopover: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));
vi.mock("@/features/page-graph/components/local-page-graph", () => ({
  LocalPageGraph: () => <div>Local graph</div>,
}));
vi.mock("@/features/page/components/page-import-modal.tsx", () => ({
  default: () => null,
}));
vi.mock("@/components/common/export-modal", () => ({ default: () => null }));
vi.mock("@/features/space/queries/space-watcher-query.ts", () => ({
  useSpaceWatchStatusQuery: () => ({ data: { watching: false } }),
  useWatchSpaceMutation: () => ({ mutate: vi.fn() }),
  useUnwatchSpaceMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/features/favorite/queries/favorite-query", () => ({
  useFavoriteIds: () => new Set(),
  useAddFavoriteMutation: () => ({ mutate: vi.fn() }),
  useRemoveFavoriteMutation: () => ({ mutate: vi.fn() }),
}));
vi.mock(
  "@/components/layouts/global/hooks/hooks/use-toggle-sidebar.ts",
  () => ({
    useToggleSidebar: () => mocks.toggleMobileSidebar,
  }),
);
vi.mock("@/components/layouts/global/hooks/atoms/sidebar-atom.ts", () => ({
  mobileSidebarAtom: {},
}));
vi.mock("@/features/user/atoms/current-user-atom", () => ({
  currentUserAtom: {},
}));
vi.mock("@/features/home/navigation/docs-entry", () => ({
  rememberLastDocsContext: mocks.rememberLastDocsContext,
}));
vi.mock("@/features/search/constants", () => ({
  searchSpotlight: { open: vi.fn() },
}));

import { SpaceSidebar } from "./space-sidebar";

const createSpace = (source: "explicit" | "team-admin"): ISpace => ({
  id: "space-1",
  name: "General",
  description: "",
  slug: "general",
  teamId: "team-1",
  hostname: "localhost",
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  permission: {
    userId: "user-1",
    canView: true,
    canCreate: true,
    canEdit: true,
    canDelete: true,
    source,
  },
});

function renderSidebar(collapsed = false) {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/s/general"]}>
        <Routes>
          <Route
            path="/s/:spaceSlug"
            element={<SpaceSidebar collapsed={collapsed} />}
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("SpaceSidebar", () => {
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
  });

  beforeEach(() => {
    mocks.useGetSpaceBySlugQuery.mockReset();
    mocks.useTeamQuery.mockReset();
    mocks.useTeamsQuery.mockReset();
    mocks.useGetSpaceBySlugQuery.mockReturnValue({
      data: createSpace("explicit"),
    });
    mocks.useTeamQuery.mockReturnValue({ data: undefined });
    mocks.useTeamsQuery.mockReturnValue({ data: { items: [] } });
  });

  it("não expõe configurações a membro, mesmo com permissões de página", () => {
    renderSidebar();

    expect(screen.queryByText("Space settings")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Space menu" }));

    expect(screen.queryByText("Space settings")).toBeNull();
  });

  it("não expõe o atalho de configurações quando a sidebar está recolhida", () => {
    renderSidebar(true);

    expect(screen.queryByLabelText("Space settings")).toBeNull();
    expect(screen.queryByText("Space settings")).toBeNull();
  });

  it("expõe os atalhos de configurações para administrador do Time", async () => {
    mocks.useGetSpaceBySlugQuery.mockReturnValue({
      data: createSpace("team-admin"),
    });

    renderSidebar();

    expect(screen.getByText("Space settings")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Space menu" }));

    await waitFor(() => {
      expect(screen.getAllByText("Space settings")).toHaveLength(2);
    });
  });

  it("apresenta as ações de páginas como botões leves e acessíveis", () => {
    renderSidebar();

    expect(
      screen.getByRole("button", { name: "Space menu" }).getAttribute(
        "data-variant",
      ),
    ).toBe("light");
    expect(
      screen.getByRole("button", { name: "Space menu" }).getAttribute(
        "data-size",
      ),
    ).toBe("md");
    expect(
      screen.getByRole("button", { name: "Create page" }).getAttribute(
        "data-variant",
      ),
    ).toBe("light");
    expect(
      screen.getByRole("button", { name: "Create page" }).getAttribute(
        "data-size",
      ),
    ).toBe("md");
  });
});
