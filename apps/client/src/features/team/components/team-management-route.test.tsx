import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/lib/types";

const mocks = vi.hoisted(() => ({ useCurrentUser: vi.fn(), useTeamsQuery: vi.fn() }));
vi.mock("@/features/user/hooks/use-current-user", () => ({ default: () => mocks.useCurrentUser() }));
vi.mock("@/features/team/queries/team-query", () => ({ useTeamsQuery: () => mocks.useTeamsQuery() }));
import { TeamManagementRoute } from "./team-management-route";

function renderGuard() {
  return render(<MemoryRouter initialEntries={["/settings/teams"]}><Routes><Route path="/home" element={<div>Home</div>} /><Route path="/settings/teams" element={<TeamManagementRoute><div>Teams settings</div></TeamManagementRoute>} /></Routes></MemoryRouter>);
}

describe("TeamManagementRoute", () => {
  it("permite administrador global", () => {
    mocks.useCurrentUser.mockReturnValue({ data: { user: { role: UserRole.ADMIN } }, isLoading: false });
    mocks.useTeamsQuery.mockReturnValue({ data: { items: [] }, isLoading: false });
    renderGuard();
    expect(screen.getByText("Teams settings")).not.toBeNull();
  });

  it("permite administrador de time sem conceder papel global", () => {
    mocks.useCurrentUser.mockReturnValue({ data: { user: { role: UserRole.MEMBER } }, isLoading: false });
    mocks.useTeamsQuery.mockReturnValue({ data: { items: [{ isAdmin: true }] }, isLoading: false });
    renderGuard();
    expect(screen.getByText("Teams settings")).not.toBeNull();
  });

  it("redireciona membro comum", () => {
    mocks.useCurrentUser.mockReturnValue({ data: { user: { role: UserRole.MEMBER } }, isLoading: false });
    mocks.useTeamsQuery.mockReturnValue({ data: { items: [{ isAdmin: false }] }, isLoading: false });
    renderGuard();
    expect(screen.getByText("Home")).not.toBeNull();
  });
});
