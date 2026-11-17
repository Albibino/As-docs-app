import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ComponentProps } from "react";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISpace } from "@/features/space/types/space.types";

const mocks = vi.hoisted(() => ({
  useGetSpacesQuery: vi.fn(),
  navigate: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/space/queries/space-query", () => ({
  useGetSpacesQuery: (...args: unknown[]) => mocks.useGetSpacesQuery(...args),
}));

vi.mock("react-router-dom", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react-router-dom")>()),
  useNavigate: () => mocks.navigate,
}));

import { SpaceSwitcher } from "./space-switcher";

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

  Object.defineProperty(window, "ResizeObserver", {
    writable: true,
    value: ResizeObserverMock,
  });
});

const currentSpace: ISpace = {
  id: "space-1",
  name: "Space atual",
  description: "",
  slug: "space-atual",
  teamId: "team-1",
  hostname: "localhost",
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
};

function renderSwitcher(props: Partial<ComponentProps<typeof SpaceSwitcher>> = {}) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <SpaceSwitcher currentSpace={currentSpace} teamId="team-1" {...props} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("SpaceSwitcher", () => {
  beforeEach(() => {
    mocks.useGetSpacesQuery.mockReset();
    mocks.navigate.mockReset();
    mocks.useGetSpacesQuery.mockReturnValue({
      data: { items: [] },
      isPending: false,
      isError: false,
    });
  });

  it("consulta os Spaces do Time pendente", () => {
    renderSwitcher({ pendingTeamId: "team-2", opened: true });

    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith({ teamId: "team-2", limit: 50 });
  });

  it("não exibe resultados mantidos em cache de outro Time", () => {
    mocks.useGetSpacesQuery.mockReturnValue({
      data: { items: [{ ...currentSpace, name: "Space de outro Time" }] },
      isPending: false,
      isPlaceholderData: true,
      isError: false,
    });

    renderSwitcher({ pendingTeamId: "team-2", opened: true });

    expect(screen.getByText("Loading")).not.toBeNull();
    expect(screen.queryByText("Space de outro Time")).toBeNull();
  });

  it("cancela a troca pendente ao fechar o estado vazio", () => {
    const onOpenedChange = vi.fn();
    const onCancelPendingChange = vi.fn();

    renderSwitcher({
      pendingTeamId: "team-2",
      opened: true,
      onOpenedChange,
      onCancelPendingChange,
    });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onOpenedChange).toHaveBeenCalledWith(false);
    expect(onCancelPendingChange).toHaveBeenCalledOnce();
  });

  it("navega para o Space selecionado sem cancelar o Time pendente", async () => {
    const onCancelPendingChange = vi.fn();
    const onOpenedChange = vi.fn();
    mocks.useGetSpacesQuery.mockReturnValue({
      data: {
        items: [{
          ...currentSpace,
          id: "space-2",
          name: "Space destino",
          slug: "space-destino",
          teamId: "team-2",
        }],
      },
      isPending: false,
      isPlaceholderData: false,
      isError: false,
    });

    renderSwitcher({
      pendingTeamId: "team-2",
      opened: true,
      onOpenedChange,
      onCancelPendingChange,
    });

    fireEvent.click(screen.getByRole("combobox", { name: "Select a space" }));
    fireEvent.click(await screen.findByText("Space destino"));

    expect(mocks.navigate).toHaveBeenCalledWith("/s/space-destino");
    expect(onOpenedChange).toHaveBeenCalledWith(false);
    expect(onCancelPendingChange).not.toHaveBeenCalled();
  });
});
