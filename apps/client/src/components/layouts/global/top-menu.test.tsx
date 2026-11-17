import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  useAtom: vi.fn(),
  logout: vi.fn(),
}));

vi.mock("react-i18next", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-i18next")>()),
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("jotai", async (importOriginal) => ({
  ...(await importOriginal<typeof import("jotai")>()),
  useAtom: () => mocks.useAtom(),
}));

vi.mock("@/features/user/atoms/current-user-atom.ts", () => ({
  currentUserAtom: {},
}));

vi.mock("@/features/auth/hooks/use-auth.ts", () => ({
  default: () => ({ logout: mocks.logout }),
}));

vi.mock("@/hooks/use-user-role", () => ({
  default: () => ({ isAdmin: false }),
}));

vi.mock("@/components/ui/custom-avatar.tsx", () => ({
  CustomAvatar: () => <span data-testid="custom-avatar" />,
}));

import TopMenu from "./top-menu";

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

beforeEach(() => {
  mocks.useAtom.mockReturnValue([
    {
      user: {
        avatarUrl: null,
        email: "ada@example.com",
        name: "Ada Lovelace",
      },
      workspace: {
        logo: null,
        name: "Docs",
      },
    },
  ]);
});

function renderMenu() {
  return render(
    <MantineProvider>
      <MemoryRouter initialEntries={["/home"]}>
        <TopMenu />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("TopMenu", () => {
  it("remove o item redundante Meu perfil e mantém o bloco de identidade", async () => {
    renderMenu();

    fireEvent.click(screen.getByRole("button", { name: "Docs" }));

    await waitFor(() => {
      const identityItem = screen
        .getAllByRole("menuitem", { hidden: true })
        .find((item) => item.textContent?.includes("Ada Lovelace"));

      expect(identityItem).not.toBeUndefined();
      expect(identityItem?.getAttribute("href")).toBe(
        "/settings/account/profile",
      );
    });

    expect(screen.queryByText("My profile")).toBeNull();
  });
});
