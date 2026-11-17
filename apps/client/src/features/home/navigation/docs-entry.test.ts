import { beforeEach, describe, expect, it } from "vitest";
import type { ISpace } from "@/features/space/types/space.types";
import type { ITeam } from "@/features/team/types/team.types";
import {
  readLastDocsContext,
  rememberLastDocsContext,
  resolveDocsEntryTarget,
} from "./docs-entry";

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

const space = (
  slug: string,
  teamId: string,
  archivedAt: Date | null = null,
): ISpace => ({
  id: `${teamId}-${slug}`,
  name: slug,
  description: "",
  slug,
  teamId,
  hostname: "",
  creatorId: "user-1",
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  archivedAt,
});

describe("resolveDocsEntryTarget", () => {
  it("abre o diretório de Times para administradores do workspace", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: true,
        teams: [],
        spaces: [],
      }),
    ).toEqual({ kind: "team-directory" });
  });

  it("abre o primeiro Time administrado respeitando a ordem dos Times", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: false,
        teams: [team("team-1", true), team("team-2", true)],
        spaces: [space("space-2", "team-2")],
      }),
    ).toEqual({ kind: "team-spaces", teamId: "team-1" });
  });

  it("restaura Time e Space válidos para um membro", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: false,
        teams: [team("team-1")],
        spaces: [space("first", "team-1"), space("last", "team-1")],
        lastContext: { teamId: "team-1", spaceSlug: "last" },
      }),
    ).toEqual({ kind: "space", teamId: "team-1", spaceSlug: "last" });
  });

  it("usa o primeiro Space acessível quando o contexto salvo foi revogado", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: false,
        teams: [team("team-1")],
        spaces: [space("first", "team-1"), space("revoked", "team-2")],
        lastContext: { teamId: "team-2", spaceSlug: "revoked" },
      }),
    ).toEqual({ kind: "space", teamId: "team-1", spaceSlug: "first" });
  });

  it("ignora Spaces arquivados e Spaces de Times inexistentes", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: false,
        teams: [team("team-1")],
        spaces: [
          space("archived", "team-1", new Date("2026-02-01T00:00:00.000Z")),
          space("orphan", "team-revoked"),
        ],
        lastContext: { teamId: "team-1", spaceSlug: "archived" },
      }),
    ).toEqual({ kind: "empty" });
  });

  it("retorna estado vazio quando não há Space acessível", () => {
    expect(
      resolveDocsEntryTarget({
        isWorkspaceAdmin: false,
        teams: [],
        spaces: [],
      }),
    ).toEqual({ kind: "empty" });
  });
});

describe("persistência do último contexto", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it("lê o contexto JSON atual", () => {
    window.localStorage.setItem(
      "docs:last-context:workspace-1:user-1",
      JSON.stringify({ teamId: "team-1", spaceSlug: "general" }),
    );

    expect(readLastDocsContext("workspace-1", "user-1")).toEqual({
      teamId: "team-1",
      spaceSlug: "general",
    });
  });

  it("mantém compatibilidade de leitura com o slug legado", () => {
    window.localStorage.setItem(
      "docs:last-context:workspace-1:user-1",
      "general",
    );

    expect(readLastDocsContext("workspace-1", "user-1")).toBe("general");
  });

  it("ignora JSON malformado ou com contrato incompleto", () => {
    window.localStorage.setItem(
      "docs:last-context:workspace-1:user-1",
      JSON.stringify({ teamId: "team-1" }),
    );

    expect(readLastDocsContext("workspace-1", "user-1")).toBeNull();
  });

  it("persiste JSON somente para um Time e Space acessíveis e correspondentes", () => {
    const saved = rememberLastDocsContext({
      workspaceId: "workspace-1",
      userId: "user-1",
      context: { teamId: "team-1", spaceSlug: "general" },
      teams: [team("team-1")],
      spaces: [space("general", "team-1")],
    });

    expect(saved).toBe(true);
    expect(
      window.localStorage.getItem("docs:last-context:workspace-1:user-1"),
    ).toBe(JSON.stringify({ teamId: "team-1", spaceSlug: "general" }));
  });

  it.each([
    {
      name: "Time revogado",
      teams: [] as ITeam[],
      spaces: [space("general", "team-1")],
    },
    {
      name: "Space revogado",
      teams: [team("team-1")],
      spaces: [] as ISpace[],
    },
    {
      name: "Space arquivado",
      teams: [team("team-1")],
      spaces: [
        space("general", "team-1", new Date("2026-02-01T00:00:00.000Z")),
      ],
    },
    {
      name: "Space de outro Time",
      teams: [team("team-1"), team("team-2")],
      spaces: [space("general", "team-2")],
    },
  ])("não persiste quando o contexto é inválido: $name", ({ teams, spaces }) => {
    const saved = rememberLastDocsContext({
      workspaceId: "workspace-1",
      userId: "user-1",
      context: { teamId: "team-1", spaceSlug: "general" },
      teams,
      spaces,
    });

    expect(saved).toBe(false);
    expect(
      window.localStorage.getItem("docs:last-context:workspace-1:user-1"),
    ).toBeNull();
  });
});
