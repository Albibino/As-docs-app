import { MantineProvider } from "@mantine/core";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { Provider as JotaiProvider } from "jotai";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  conversations: [] as any[],
  rename: vi.fn(),
  remove: vi.fn(),
  openConfirmModal: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      key.replace(/\{\{(\w+)\}\}/g, (_, name) => String(vars?.[name] ?? "")),
    i18n: { language: "pt-BR" },
  }),
}));
// O átomo real lê localStorage ao ser importado; aqui basta um átomo comum.
vi.mock("@/components/layouts/global/hooks/atoms/sidebar-atom", async () => {
  const { atom } = await import("jotai");
  return { sidebarChatsOpenAtom: atom(false) };
});
// A animação do Collapse não termina no jsdom e deixa o conteúdo "oculto".
vi.mock("@mantine/core", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  Collapse: ({ expanded, children, id }: any) =>
    expanded ? <div id={id}>{children}</div> : null,
}));
vi.mock("@mantine/modals", () => ({
  modals: { openConfirmModal: mocks.openConfirmModal },
}));
vi.mock("@mantine/hooks", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useDebouncedValue: (value: string) => [value],
}));
vi.mock("../queries/assistant-query", () => ({
  useConversationsQuery: () => ({ data: mocks.conversations, isLoading: false }),
  useConversationSearch: (query: string) => ({
    data: mocks.conversations.filter((c) => c.title?.includes(query)),
    isLoading: false,
  }),
  useRenameConversation: () => ({ mutate: mocks.rename }),
  useDeleteConversation: () => ({ mutate: mocks.remove }),
}));

import SidebarConversations from "./sidebar-conversations";

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
  // Collapse (Mantine) mede o conteúdo ao animar.
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});

const DAY = 24 * 60 * 60 * 1000;
const chat = (id: string, title: string | null, ageMs: number) => ({
  id,
  title,
  workspaceId: "w",
  creatorId: "u",
  createdAt: new Date(Date.now() - ageMs).toISOString(),
  updatedAt: new Date(Date.now() - ageMs).toISOString(),
});

function renderAt(path: string, onNavigate?: () => void) {
  return render(
    <JotaiProvider>
      <MantineProvider env="test">
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route
              path="*"
              element={<SidebarConversations onNavigate={onNavigate} />}
            />
          </Routes>
        </MemoryRouter>
      </MantineProvider>
    </JotaiProvider>,
  );
}

const toggle = () => screen.getByRole("button", { name: "Conversations" });

describe("SidebarConversations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.conversations = [
      chat("c1", "Férias", 1000),
      chat("c2", "Reembolso", DAY + 1000),
      chat("c3", null, 40 * DAY),
    ];
  });

  it("começa recolhida e expande a lista ao clicar no cabeçalho", () => {
    renderAt("/home");
    expect(toggle().getAttribute("aria-expanded")).toBe("false");

    fireEvent.click(toggle());

    expect(toggle().getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("link", { name: /Férias/ })).toBeTruthy();
  });

  it("agrupa por data e aponta cada conversa para /home/chat/:id", () => {
    renderAt("/home");
    fireEvent.click(toggle());

    const labels = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(labels).toEqual(["Today", "Yesterday", "Older"]);
    expect(
      screen.getByRole("link", { name: /Reembolso/ }).getAttribute("href"),
    ).toBe("/home/chat/c2");
    // Conversa sem título usa o texto padrão.
    expect(screen.getByRole("link", { name: /Untitled chat/ })).toBeTruthy();
  });

  it("marca a conversa aberta e oferece 'New chat' para a home", () => {
    const onNavigate = vi.fn();
    renderAt("/home/chat/c2", onNavigate);
    fireEvent.click(toggle());

    expect(
      screen.getByRole("link", { name: /Reembolso/ }).getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen.getByRole("link", { name: /Férias/ }).getAttribute("aria-current"),
    ).toBeNull();

    const newChat = screen.getByRole("link", { name: "New chat" });
    expect(newChat.getAttribute("href")).toBe("/home");
    fireEvent.click(newChat);
    expect(onNavigate).toHaveBeenCalled();
  });

  it("filtra pela busca e avisa quando nada é encontrado", () => {
    renderAt("/home");
    fireEvent.click(toggle());
    const input = screen.getByLabelText("Search chats");

    fireEvent.change(input, { target: { value: "Reemb" } });
    expect(screen.queryByRole("link", { name: /Férias/ })).toBeNull();
    expect(screen.getByRole("link", { name: /Reembolso/ })).toBeTruthy();

    fireEvent.change(input, { target: { value: "zzz" } });
    expect(screen.getByText("No chats found")).toBeTruthy();
  });

  it("mostra o estado vazio sem conversas", () => {
    mocks.conversations = [];
    renderAt("/home");
    fireEvent.click(toggle());
    expect(screen.getByText("No conversations yet")).toBeTruthy();
  });

  it("renomeia pelo menu: Enter envia o título novo", async () => {
    renderAt("/home");
    fireEvent.click(toggle());

    fireEvent.click(screen.getByRole("button", { name: "Chat menu for Férias" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Rename" }));

    const input = screen.getByLabelText("Chat name");
    fireEvent.change(input, { target: { value: "Férias 2026" } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(mocks.rename).toHaveBeenCalledWith({ chatId: "c1", title: "Férias 2026" });
  });

  it("excluir pede confirmação e só então chama a exclusão", async () => {
    renderAt("/home/chat/c1");
    fireEvent.click(toggle());

    fireEvent.click(screen.getByRole("button", { name: "Chat menu for Férias" }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Delete" }));

    expect(mocks.remove).not.toHaveBeenCalled();
    expect(mocks.openConfirmModal).toHaveBeenCalledTimes(1);
    const config = mocks.openConfirmModal.mock.calls[0][0];
    expect(config.title).toBe("Delete chat");
    render(<MantineProvider>{config.children}</MantineProvider>);
    expect(screen.getByText(/'Férias'/)).toBeTruthy();

    config.onConfirm();
    expect(mocks.remove).toHaveBeenCalledWith("c1", expect.any(Object));
  });
});
