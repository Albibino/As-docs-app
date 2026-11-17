import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISpace } from "@/features/space/types/space.types.ts";
import type { SpacePermissionSource } from "@/features/space/types/space-permission.types.ts";

const mocks = vi.hoisted(() => ({
  useGetSpaceBySlugQuery: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/space/queries/space-query.ts", () => ({
  useGetSpaceBySlugQuery: (...args: unknown[]) =>
    mocks.useGetSpaceBySlugQuery(...args),
}));

vi.mock("@/components/settings/settings-title.tsx", () => ({
  default: ({ title }: { title: string }) => <h1>{title}</h1>,
}));
vi.mock("@/features/space/components/space-details.tsx", () => ({
  default: () => <div>Space details</div>,
}));
vi.mock("@/features/space/components/space-permissions.tsx", () => ({
  SpacePermissions: () => <div>Space permissions</div>,
}));
vi.mock("@/features/label/components/admin/label-taxonomy-manager.tsx", () => ({
  LabelTaxonomyManager: () => <div>Labels</div>,
}));
vi.mock("@/features/page-property", () => ({
  SpacePagePropertiesSettings: () => <div>Properties</div>,
}));
vi.mock("@/features/space/components/space-security-settings.tsx", () => ({
  default: () => <div>Security</div>,
}));
vi.mock("react-helmet-async", () => ({
  Helmet: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import SpaceSettings from "./space-settings.tsx";

const createSpace = (source: SpacePermissionSource): ISpace => ({
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

function LocationDisplay() {
  const location = useLocation();
  return <output>{location.pathname}</output>;
}

function renderSettings(path = "/s/general/settings/general") {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={[path]}>
        <LocationDisplay />
        <Routes>
          <Route path="/s/:spaceSlug" element={<div>Space home</div>} />
          <Route
            path="/s/:spaceSlug/settings/:tab"
            element={<SpaceSettings />}
          />
        </Routes>
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("SpaceSettings", () => {
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
  });

  it("aguarda o carregamento do Space antes de decidir o redirecionamento", () => {
    mocks.useGetSpaceBySlugQuery.mockReturnValue({
      data: undefined,
      isPending: true,
    });

    renderSettings();

    expect(screen.getByText("/s/general/settings/general")).not.toBeNull();
    expect(screen.queryByText("Space home")).toBeNull();
  });

  it("redireciona membro do Time para o Space", async () => {
    mocks.useGetSpaceBySlugQuery.mockReturnValue({
      data: createSpace("explicit"),
      isPending: false,
    });

    renderSettings("/s/general/settings/members");

    await waitFor(() => {
      expect(screen.getByText("/s/general")).not.toBeNull();
    });
    expect(screen.getByText("Space home")).not.toBeNull();
  });

  it.each(["team-admin", "workspace-admin"] as const)(
    "mantém a configuração disponível para %s",
    (source) => {
      mocks.useGetSpaceBySlugQuery.mockReturnValue({
        data: createSpace(source),
        isPending: false,
      });

      renderSettings();

      expect(screen.getByText("/s/general/settings/general")).not.toBeNull();
      expect(screen.getByText("Space details")).not.toBeNull();
    },
  );
});
