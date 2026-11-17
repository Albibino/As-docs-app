import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useGetSpacesQuery: vi.fn(),
  useTeamQuery: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/hooks/use-user-role", () => ({
  default: () => ({ isAdmin: false }),
}));

vi.mock("@/hooks/use-paginate-and-search", () => ({
  usePaginateAndSearch: () => ({
    search: "",
    cursor: undefined,
    goNext: vi.fn(),
    goPrev: vi.fn(),
    handleSearch: vi.fn(),
  }),
}));

vi.mock("@/features/space/queries/space-query", () => ({
  useGetSpacesQuery: (...args: unknown[]) => mocks.useGetSpacesQuery(...args),
}));

vi.mock("@/features/team/queries/team-query", () => ({
  useTeamQuery: (...args: unknown[]) => mocks.useTeamQuery(...args),
}));

vi.mock("@/features/space/components/create-space-modal", () => ({
  default: () => null,
}));

vi.mock("@/features/space/components/spaces-page", () => ({
  AllSpacesList: ({ spaces }: { spaces: Array<{ name: string }> }) => (
    <ul>
      {spaces.map((space) => (
        <li key={space.name}>{space.name}</li>
      ))}
    </ul>
  ),
}));

import Spaces from "./spaces";

describe("Spaces", () => {
  beforeAll(() => {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  });

  beforeEach(() => {
    mocks.useTeamQuery.mockReturnValue({
      data: { id: "team-erp", name: "ERP", isAdmin: false },
    });
    mocks.useGetSpacesQuery.mockReturnValue({
      data: {
        items: [
          { id: "space-erp", name: "ERP", teamId: "team-erp" },
          { id: "space-dev", name: "DEV", teamId: "team-dev" },
        ],
        meta: {},
      },
      isLoading: false,
      isPlaceholderData: true,
    });
  });

  it("does not show a stale Space from another team", () => {
    render(
      <MantineProvider>
        <MemoryRouter initialEntries={["/spaces?teamId=team-erp"]}>
          <Spaces />
        </MemoryRouter>
      </MantineProvider>,
    );

    expect(screen.getAllByText("ERP")).not.toHaveLength(0);
    expect(screen.queryByText("DEV")).toBeNull();
  });
});
