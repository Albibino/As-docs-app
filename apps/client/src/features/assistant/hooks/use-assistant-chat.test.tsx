import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import type { SendParams, StreamEvent } from "../types/assistant.types";

type Handlers = {
  onEvent: (event: StreamEvent) => void;
  onFailure: (failure: { status?: number }) => void;
  onComplete: () => void;
};
const calls: { params: SendParams; handlers: Handlers; signal?: AbortSignal }[] = [];

vi.mock("../services/assistant-service", () => ({
  streamAnswer: (params: SendParams, handlers: Handlers, signal?: AbortSignal) => {
    calls.push({ params, handlers, signal });
    return Promise.resolve();
  },
}));

import { useAssistantChat } from "./use-assistant-chat";

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
  );
}

const PAGE_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  calls.length = 0;
});

describe("useAssistantChat", () => {
  it("envia a página aberta como contexto e mantém fontes e defasagem", () => {
    const { result } = renderHook(
      () => useAssistantChat({ chatId: "chat-1" }),
      { wrapper },
    );

    act(() => {
      result.current.send("  Quantos dias?  ", PAGE_ID);
    });
    expect(calls[0].params).toEqual({
      chatId: "chat-1",
      content: "Quantos dias?",
      contextPageId: PAGE_ID,
    });
    expect(result.current.isStreaming).toBe(true);

    const emit = calls[0].handlers.onEvent;
    act(() => {
      emit({
        type: "freshness",
        checked: true,
        stalePages: [{ pageId: PAGE_ID, title: "Férias", indexedVersion: 1, currentVersion: 2 }],
      });
      emit({ type: "content", text: "Com 45 dias " });
      emit({ type: "content", text: "[1]." });
    });
    expect(result.current.draft?.text).toBe("Com 45 dias [1].");

    act(() => emit({ type: "done", messageId: "m1", found: true }));
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.current.messages[1]).toMatchObject({
      id: "m1",
      content: "Com 45 dias [1].",
      meta: { found: true, stalePages: [{ currentVersion: 2 }] },
    });
  });

  it("não envia pergunta vazia nem uma segunda enquanto gera", () => {
    const { result } = renderHook(() => useAssistantChat({ chatId: undefined }), {
      wrapper,
    });
    act(() => {
      expect(result.current.send("   ")).toBe(false);
      expect(result.current.send("primeira")).toBe(true);
      expect(result.current.send("segunda")).toBe(false);
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual({ chatId: undefined, content: "primeira" });
  });

  it("chat_created avisa quem chamou e mantém as mensagens na tela", () => {
    const onChatCreated = vi.fn();
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId?: string }) =>
        useAssistantChat({ chatId, onChatCreated }),
      { wrapper, initialProps: { chatId: undefined as string | undefined } },
    );
    act(() => {
      result.current.send("Oi");
    });
    act(() => calls[0].handlers.onEvent({ type: "chat_created", chatId: "novo" }));
    expect(onChatCreated).toHaveBeenCalledWith("novo");

    rerender({ chatId: "novo" }); // a URL passa a apontar para a conversa criada
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.isStreaming).toBe(true);

    // O histórico do servidor não sobrescreve o que já está na tela.
    act(() => result.current.loadHistory([]));
    expect(result.current.messages).toHaveLength(1);
  });

  it("carrega o histórico e descarta o estado ao trocar de conversa", () => {
    const { result, rerender } = renderHook(
      ({ chatId }: { chatId?: string }) => useAssistantChat({ chatId }),
      { wrapper, initialProps: { chatId: "a" as string | undefined } },
    );
    act(() =>
      result.current.loadHistory([
        { id: "1", chatId: "a", role: "user", content: "oi", metadata: null, createdAt: "" },
      ]),
    );
    expect(result.current.messages).toHaveLength(1);

    rerender({ chatId: "b" });
    expect(result.current.messages).toHaveLength(0);
  });

  it("parar cancela a requisição e guarda o texto parcial", () => {
    const { result } = renderHook(() => useAssistantChat({ chatId: "c" }), { wrapper });
    act(() => {
      result.current.send("Pergunta");
    });
    act(() => calls[0].handlers.onEvent({ type: "content", text: "parcial" }));
    act(() => result.current.stop());

    expect(calls[0].signal?.aborted).toBe(true);
    expect(result.current.isStreaming).toBe(false);
    expect(result.current.messages.at(-1)).toMatchObject({
      role: "assistant",
      content: "parcial",
    });

    // Eventos atrasados da requisição cancelada são ignorados.
    act(() => calls[0].handlers.onEvent({ type: "content", text: "tarde" }));
    expect(result.current.draft).toBeNull();
  });

  it("falha HTTP 503 vira erro de indisponibilidade", () => {
    const { result } = renderHook(() => useAssistantChat({ chatId: "c" }), { wrapper });
    act(() => {
      result.current.send("Oi");
    });
    act(() => calls[0].handlers.onFailure({ status: 503 }));
    expect(result.current.error).toEqual({ kind: "unavailable" });
    expect(result.current.isStreaming).toBe(false);
  });
});
