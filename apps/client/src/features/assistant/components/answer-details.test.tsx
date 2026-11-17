import { MantineProvider } from "@mantine/core";
import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeAll, describe, expect, it, vi } from "vitest";
import AnswerDetails from "./answer-details";
import type { AnswerMeta } from "../types/assistant.types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars?.[name] ?? "")),
  }),
}));

beforeAll(() => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
});

const PAGE = {
  pageId: "11111111-1111-4111-8111-111111111111",
  title: "Política de férias",
  slugId: "abc123",
  spaceSlug: "documentos",
};

function renderDetails(meta: AnswerMeta | null | undefined) {
  return render(
    <MantineProvider>
      <MemoryRouter>
        <AnswerDetails meta={meta} />
      </MemoryRouter>
    </MantineProvider>,
  );
}

describe("AnswerDetails", () => {
  it("lista as fontes numeradas com link para a página", () => {
    renderDetails({
      found: true,
      sources: [
        { ...PAGE, n: 1, origin: "index", version: 3 },
        { pageId: "x", title: "Sem link" },
      ],
    });

    const sources = screen.getByTestId("assistant-sources");
    expect(within(sources).getByText("Sources")).toBeTruthy();
    expect(sources.textContent).toContain("[1]");
    expect(sources.textContent).toContain("[2]"); // sem n: usa a posição
    expect(
      screen.getByRole("link", { name: PAGE.title }).getAttribute("href"),
    ).toBe("/s/documentos/p/abc123");
    // Sem slug/espaço não há link, só o título.
    expect(screen.queryByRole("link", { name: "Sem link" })).toBeNull();
    expect(screen.getByText("Sem link")).toBeTruthy();
    expect(screen.queryByText(/current version/)).toBeNull();
  });

  it("avisa a defasagem com as versões indexada e atual", () => {
    renderDetails({
      found: true,
      stalePages: [
        { pageId: PAGE.pageId, title: PAGE.title, indexedVersion: 1, currentVersion: 2 },
      ],
      sources: [{ ...PAGE, n: 1, origin: "mcp_read", version: 2 }],
    });

    const notice = screen.getByTestId("assistant-stale-notice");
    expect(notice.textContent).toContain("(indexed v1, current v2)");
    expect(notice.textContent).toContain(PAGE.title);
    expect(screen.getByTestId("assistant-sources").textContent).toContain(
      "current version v2",
    );
  });

  it("trata versão indexada ausente como v0", () => {
    renderDetails({
      stalePages: [{ pageId: "p", title: "Nova", indexedVersion: null, currentVersion: 1 }],
    });
    expect(screen.getByTestId("assistant-stale-notice").textContent).toContain(
      "(indexed v0, current v1)",
    );
  });

  it("not_found mostra 'não encontrei' e as páginas semelhantes como links", () => {
    renderDetails({ found: false, similar: [PAGE], sources: [PAGE] });

    expect(screen.getByTestId("assistant-not-found").textContent).toContain(
      "I couldn't find this in the documents.",
    );
    expect(screen.getByText("Similar pages:")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: PAGE.title }).getAttribute("href"),
    ).toBe("/s/documentos/p/abc123");
    // Em not_found as fontes não aparecem.
    expect(screen.queryByTestId("assistant-sources")).toBeNull();
  });

  it("not_found sem semelhantes diz que não achou nenhuma", () => {
    renderDetails({ found: false, similar: [] });
    expect(screen.getByText("No similar pages were found either.")).toBeTruthy();
  });

  it("não renderiza nada sem metadados relevantes", () => {
    renderDetails({ found: true });
    expect(screen.queryByTestId("assistant-answer-details")).toBeNull();
    cleanup();
    renderDetails(null);
    expect(screen.queryByTestId("assistant-answer-details")).toBeNull();
  });
});
