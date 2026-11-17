import { MantineProvider } from "@mantine/core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Provider as JotaiProvider, createStore } from "jotai";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  streamAnswer: vi.fn(),
  conversation: { data: undefined as any, isLoading: false, isError: false },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars?.[name] ?? "")),
  }),
}));
vi.mock("@/components/layouts/global/hooks/atoms/sidebar-atom", async () => {
  const { atom } = await import("jotai");
  return { asideStateAtom: atom({ tab: "chat", isAsideOpen: true }) };
});
vi.mock("@/features/page/queries/page-query", () => ({
  usePageQuery: () => ({
    data: { id: "page-uuid", title: "Política de férias", slugId: "abc123" },
  }),
}));
vi.mock("@/lib", () => ({
  extractPageSlugId: (slug?: string) => slug?.split("-").pop(),
}));
vi.mock("../services/assistant-service", () => ({
  streamAnswer: mocks.streamAnswer,
  listConversations: vi.fn().mockResolvedValue([]),
  searchConversations: vi.fn().mockResolvedValue([]),
  getConversation: vi.fn(),
}));
vi.mock("../queries/assistant-query", () => ({
  CONVERSATIONS_KEY: ["assistant-conversations"],
  useConversationQuery: () => mocks.conversation,
  useConversationsQuery: () => ({ data: [], isLoading: false }),
  useConversationSearch: () => ({ data: [], isLoading: false }),
}));

import AsideAssistantPanel from "./aside-assistant-panel";
import { asideStateAtom } from "@/components/layouts/global/hooks/atoms/sidebar-atom";

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
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Element.prototype.scrollTo = vi.fn();
  // O Textarea com autosize escuta o carregamento de fontes.
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { addEventListener() {}, removeEventListener() {} },
  });
});

function Where() {
  return <div data-testid="where">{useLocation().pathname}</div>;
}

function renderPanel() {
  const store = createStore();
  render(
    <QueryClientProvider client={new QueryClient()}>
      <JotaiProvider store={store}>
        <MantineProvider env="test">
          <MemoryRouter initialEntries={["/s/documentos/p/politica-abc123"]}>
            <Where />
            <Routes>
              <Route path="/s/:spaceSlug/p/:pageSlug" element={<AsideAssistantPanel />} />
              <Route path="*" element={<AsideAssistantPanel />} />
            </Routes>
          </MemoryRouter>
        </MantineProvider>
      </JotaiProvider>
    </QueryClientProvider>,
  );
  return store;
}

const ask = (text: string) => {
  const box = screen.getByRole("textbox");
  fireEvent.change(box, { target: { value: text } });
  fireEvent.keyDown(box, { key: "Enter" });
};

describe("AsideAssistantPanel", () => {
  beforeEach(() => {
    mocks.streamAnswer.mockReset().mockResolvedValue(undefined);
    mocks.conversation = { data: undefined, isLoading: false, isError: false };
  });

  it("mostra a página aberta como contexto e a envia com a pergunta", () => {
    renderPanel();
    expect(screen.getByText("Política de férias")).toBeTruthy();

    ask("Qual o prazo?");

    expect(mocks.streamAnswer).toHaveBeenCalledTimes(1);
    expect(mocks.streamAnswer.mock.calls[0][0]).toEqual({
      chatId: undefined,
      content: "Qual o prazo?",
      contextPageId: "page-uuid",
    });
    // A pergunta aparece na transcrição e a geração pode ser parada.
    expect(screen.getByText("Qual o prazo?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stop generation" })).toBeTruthy();
  });

  it("não envia contexto depois que o usuário remove a página", () => {
    renderPanel();
    fireEvent.click(
      screen.getByRole("button", { name: "Remove Política de férias from context" }),
    );

    ask("Pergunta geral");

    expect(mocks.streamAnswer.mock.calls[0][0]).toEqual({
      chatId: undefined,
      content: "Pergunta geral",
    });
  });

  it("ação rápida envia o texto traduzido com o contexto da página", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: /Summarize this page/ }));
    expect(mocks.streamAnswer.mock.calls[0][0]).toMatchObject({
      content: "Summarize this page",
      contextPageId: "page-uuid",
    });
  });

  it("'Open full page' vai para /home e fecha o painel", () => {
    const store = renderPanel();
    act(() => {
      fireEvent.click(screen.getByRole("button", { name: "Open full page" }));
    });
    expect(screen.getByTestId("where").textContent).toBe("/home");
    expect(store.get(asideStateAtom)).toEqual({ tab: "", isAsideOpen: false });
  });

  it("'Close' fecha o painel sem navegar", () => {
    const store = renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(store.get(asideStateAtom).isAsideOpen).toBe(false);
    expect(screen.getByTestId("where").textContent).toBe("/s/documentos/p/politica-abc123");
  });
});
