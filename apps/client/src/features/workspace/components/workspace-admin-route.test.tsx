import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { UserRole } from "@/lib/types";

const mocks = vi.hoisted(() => ({ useCurrentUser: vi.fn() }));

vi.mock("@/features/user/hooks/use-current-user", () => ({
  default: () => mocks.useCurrentUser(),
}));

import { WorkspaceAdminRoute } from "./workspace-admin-route";

function renderGuard(path = "/settings/workspace") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/home" element={<div>Home</div>} />
        <Route
          path="/settings/workspace"
          element={
            <WorkspaceAdminRoute>
              <div>Workspace settings</div>
            </WorkspaceAdminRoute>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("WorkspaceAdminRoute", () => {
  it.each([UserRole.OWNER, UserRole.ADMIN])(
    "permite administrador global (%s)",
    (role) => {
      mocks.useCurrentUser.mockReturnValue({
        data: { user: { role } },
        isLoading: false,
      });

      renderGuard();

      expect(screen.getByText("Workspace settings")).not.toBeNull();
    },
  );

  it("redireciona membro para o início", () => {
    mocks.useCurrentUser.mockReturnValue({
      data: { user: { role: UserRole.MEMBER } },
      isLoading: false,
    });

    renderGuard();

    expect(screen.getByText("Home")).not.toBeNull();
  });
});
