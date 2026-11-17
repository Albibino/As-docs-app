import { render, screen, waitFor } from "@testing-library/react";
import { MantineProvider } from "@mantine/core";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { ISpace } from "@/features/space/types/space.types";
import type { ITeam } from "@/features/team/types/team.types";
import { UserRole } from "@/lib/types";
import enUs from "../../../../public/locales/en-US/translation.json";
import ptBr from "../../../../public/locales/pt-BR/translation.json";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  useTeamsQuery: vi.fn(),
  useGetSpacesQuery: vi.fn(),
  storedUser: undefined as TestUser | undefined,
  currentUser: undefined as TestUser | undefined,
  teamsQuery: {
    data: { items: [] as ITeam[] },
    isPending: false,
    isError: false,
  },
  spacesQuery: {
    data: { items: [] as ISpace[] },
    isPending: false,
    isError: false,
  },
}));

type TestUser = {
  workspace: { id: string };
  user: { id: string; role: UserRole };
};

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("jotai", () => ({
  useAtomValue: () => mocks.storedUser,
}));

vi.mock("@/features/user/atoms/current-user-atom", () => ({
  currentUserAtom: {},
}));

vi.mock("@/features/user/hooks/use-current-user", () => ({
  useCurrentUser: () => ({ data: mocks.currentUser }),
}));

vi.mock("@/features/team/queries/team-query", () => ({
  useTeamsQuery: (...args: unknown[]) => mocks.useTeamsQuery(...args),
}));

vi.mock("@/features/space/queries/space-query", () => ({
  useGetSpacesQuery: (...args: unknown[]) => mocks.useGetSpacesQuery(...args),
}));

import DocsEntryRedirect from "./docs-entry-redirect";

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

function renderRedirect() {
  return render(
    <MantineProvider>
      <DocsEntryRedirect />
    </MantineProvider>,
  );
}

const user = (role: UserRole): TestUser => ({
  workspace: { id: "workspace-1" },
  user: { id: "user-1", role },
});

const team = (id: string, isAdmin = false): ITeam => ({
  id,
  workspaceId: "workspace-1",
  name: id,
  description: null,
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  membersCount: 1,
  spacesCount: 1,
  isAdmin,
});

const space = (slug: string, teamId: string): ISpace => ({
  id: `${teamId}-${slug}`,
  name: slug,
  description: "",
  slug,
  teamId,
  hostname: "",
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  archivedAt: null,
});

describe("DocsEntryRedirect", () => {
  beforeEach(() => {
    mocks.navigate.mockReset();
    mocks.useTeamsQuery.mockReset();
    mocks.useTeamsQuery.mockImplementation(() => mocks.teamsQuery);
    mocks.useGetSpacesQuery.mockReset();
    mocks.useGetSpacesQuery.mockImplementation(() => mocks.spacesQuery);
    mocks.storedUser = undefined;
    mocks.currentUser = user(UserRole.MEMBER);
    mocks.teamsQuery.data.items = [];
    mocks.teamsQuery.isPending = false;
    mocks.teamsQuery.isError = false;
    mocks.spacesQuery.data.items = [];
    mocks.spacesQuery.isPending = false;
    mocks.spacesQuery.isError = false;
    window.localStorage.clear();
  });

  it("redireciona administrador do workspace para a home", async () => {
    mocks.currentUser = user(UserRole.ADMIN);

    renderRedirect();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/home", { replace: true });
    });
    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith(
      { limit: 100 },
      false,
    );
  });

  it("redireciona administrador do workspace mesmo quando Times estão em erro", async () => {
    mocks.currentUser = user(UserRole.ADMIN);
    mocks.teamsQuery.isError = true;

    renderRedirect();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/home", { replace: true });
    });
    expect(mocks.useTeamsQuery).toHaveBeenCalledWith({ limit: 100 }, false);
    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith(
      { limit: 100 },
      false,
    );
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("redireciona administrador de Time sem depender de Space", async () => {
    mocks.teamsQuery.data.items = [team("team-1", true)];

    renderRedirect();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/spaces?teamId=team-1", {
        replace: true,
      });
    });
    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith(
      { limit: 100 },
      false,
    );
  });

  it("habilita Spaces para membro somente depois de carregar os Times", () => {
    mocks.teamsQuery.data.items = [team("team-1")];

    renderRedirect();

    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith({ limit: 100 }, true);
  });

  it("mantém Spaces desabilitados enquanto Times estão pendentes", () => {
    mocks.teamsQuery.isPending = true;

    renderRedirect();

    expect(mocks.useGetSpacesQuery).toHaveBeenCalledWith(
      { limit: 100 },
      false,
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("navega para o Space acessível e persiste o contexto validado", async () => {
    mocks.teamsQuery.data.items = [team("team-1")];
    mocks.spacesQuery.data.items = [space("general", "team-1")];

    renderRedirect();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/s/general", {
        replace: true,
      });
    });
    expect(
      window.localStorage.getItem("docs:last-context:workspace-1:user-1"),
    ).toBe(JSON.stringify({ teamId: "team-1", spaceSlug: "general" }));
  });

  it("migra o slug legado para JSON depois da navegação validada", async () => {
    mocks.teamsQuery.data.items = [team("team-1")];
    mocks.spacesQuery.data.items = [space("first", "team-1"), space("general", "team-1")];
    window.localStorage.setItem(
      "docs:last-context:workspace-1:user-1",
      "general",
    );

    renderRedirect();

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/s/general", {
        replace: true,
      });
    });
    expect(
      window.localStorage.getItem("docs:last-context:workspace-1:user-1"),
    ).toBe(JSON.stringify({ teamId: "team-1", spaceSlug: "general" }));
  });

  it("mostra erro traduzido de Times sem resolver navegação", async () => {
    mocks.teamsQuery.isError = true;

    renderRedirect();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to load teams",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("mostra erro traduzido de Spaces sem resolver navegação", async () => {
    mocks.teamsQuery.data.items = [team("team-1")];
    mocks.spacesQuery.isError = true;

    renderRedirect();

    expect((await screen.findByRole("alert")).textContent).toContain(
      "Unable to load spaces",
    );
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it("expõe o estado vazio traduzido como região de status", async () => {
    renderRedirect();

    expect((await screen.findByRole("status")).textContent).toContain(
      "No accessible spaces",
    );
    expect(
      screen.getByText(
        "Ask a workspace or team administrator to give you access.",
      ),
    ).not.toBeNull();
  });

  it("recalcula o estado vazio quando surge um contexto acessível", async () => {
    const view = renderRedirect();
    expect((await screen.findByRole("status")).textContent).toContain(
      "No accessible spaces",
    );

    mocks.teamsQuery.data.items = [team("team-1")];
    mocks.spacesQuery.data.items = [space("general", "team-1")];
    view.rerender(
      <MantineProvider>
        <DocsEntryRedirect />
      </MantineProvider>,
    );

    await waitFor(() => {
      expect(mocks.navigate).toHaveBeenCalledWith("/s/general", {
        replace: true,
      });
    });
  });
});

describe("traduções do redirecionamento", () => {
  it.each(["Unable to load teams", "Unable to load spaces"] as const)(
    "mantém a chave %s em inglês e português",
    (key) => {
      expect(enUs[key]).toBeTruthy();
      expect(ptBr[key]).toBeTruthy();
    },
  );
});
