import { MantineProvider } from "@mantine/core";
import { render, screen } from "@testing-library/react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { ITeam } from "@/features/team/types/team.types";
import { TeamSwitcher } from "./team-switcher";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

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

const teams: ITeam[] = [
  {
    id: "team-1",
    workspaceId: "workspace-1",
    name: "Time atual",
    description: null,
    creatorId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    membersCount: 1,
    spacesCount: 1,
    isAdmin: true,
  },
  {
    id: "team-2",
    workspaceId: "workspace-1",
    name: "Novo time",
    description: null,
    creatorId: "user-1",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    membersCount: 1,
    spacesCount: 1,
    isAdmin: false,
  },
];

describe("TeamSwitcher", () => {
  it("exibe o Time pendente imediatamente após sua seleção", () => {
    render(
      <MantineProvider>
        <TeamSwitcher
          currentTeamId="team-1"
          pendingTeamId="team-2"
          teams={teams}
          onTeamChange={vi.fn()}
        />
      </MantineProvider>,
    );

    expect(screen.getByRole("button", { name: "Select a team" }).textContent).toContain("Novo time");
  });
});
