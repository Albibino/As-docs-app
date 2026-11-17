import { describe, expect, it } from "vitest";
import {
  conversationReducer,
  fromServerMessages,
  initialConversationState,
  type ConversationState,
} from "./conversation-state";
import type { StreamEvent } from "../types/assistant.types";

const NOW = "2026-10-23T12:00:00.000Z";
const user = {
  id: "u1",
  role: "user" as const,
  content: "Quantos dias?",
  meta: null,
  createdAt: NOW,
};

function play(events: StreamEvent[]): ConversationState {
  let state = conversationReducer(initialConversationState, {
    type: "ask",
    message: user,
  });
  for (const event of events) {
    state = conversationReducer(state, { type: "event", event, now: NOW });
  }
  return state;
}

describe("conversationReducer", () => {
  it("acumula o texto e guarda fontes e defasagem na resposta final", () => {
    const stale = [{ pageId: "p1", title: "Férias", indexedVersion: 1, currentVersion: 2 }];
    const mid = play([
      { type: "freshness", checked: true, stalePages: stale },
      { type: "sources", sources: [{ pageId: "p1", title: "Férias", n: 1 }] },
      { type: "content", text: "Com 45 dias " },
      { type: "content", text: "[1]." },
    ]);
    expect(mid.draft?.text).toBe("Com 45 dias [1].");
    expect(mid.draft?.meta.stalePages).toEqual(stale);

    const end = conversationReducer(mid, {
      type: "event",
      event: { type: "done", messageId: "m1", found: true },
      now: NOW,
    });
    expect(end.draft).toBeNull();
    expect(end.messages.at(-1)).toMatchObject({
      id: "m1",
      role: "assistant",
      content: "Com 45 dias [1].",
      meta: { found: true, stalePages: stale, sources: [{ n: 1 }] },
    });
  });

  it("not_found termina sem texto e com as páginas semelhantes", () => {
    const state = play([
      { type: "not_found", similar: [{ pageId: "p2", title: "Remuneração" }] },
      { type: "done", messageId: "m2", found: false },
    ]);
    expect(state.messages.at(-1)).toMatchObject({
      content: null,
      meta: { found: false, similar: [{ title: "Remuneração" }] },
    });
  });

  it("evento error encerra a geração e traduz o código", () => {
    const unavailable = play([
      { type: "content", text: "par" },
      { type: "error", code: "ai_unavailable", message: "ai_unavailable" },
    ]);
    expect(unavailable.draft).toBeNull();
    expect(unavailable.error).toEqual({ kind: "unavailable" });
    expect(play([{ type: "error", code: "chat_failed" }]).error).toEqual({
      kind: "failed",
    });
  });

  it("parar mantém o texto parcial; sem texto não cria mensagem", () => {
    const partial = conversationReducer(
      play([{ type: "content", text: "meio" }]),
      { type: "stop", now: NOW, id: "s1" },
    );
    expect(partial.messages.at(-1)).toMatchObject({ id: "s1", content: "meio" });
    expect(partial.draft).toBeNull();

    const empty = conversationReducer(play([]), { type: "stop", now: NOW, id: "s2" });
    expect(empty.messages).toHaveLength(1);
  });

  it("fluxo fechado sem done guarda o parcial e marca interrupção", () => {
    const state = conversationReducer(play([{ type: "content", text: "abc" }]), {
      type: "closed",
      now: NOW,
      id: "c1",
    });
    expect(state.error).toEqual({ kind: "interrupted" });
    expect(state.messages.at(-1)?.content).toBe("abc");
  });

  it("converte mensagens do servidor, descartando as de ferramenta", () => {
    const messages = fromServerMessages([
      { id: "1", chatId: "c", role: "user", content: "oi", metadata: null, createdAt: NOW },
      { id: "2", chatId: "c", role: "tool", content: "x", metadata: null, createdAt: NOW },
      {
        id: "3",
        chatId: "c",
        role: "assistant",
        content: null,
        metadata: { found: false, similar: [{ pageId: "p", title: "T" }] },
        createdAt: NOW,
      },
    ]);
    expect(messages.map((m) => m.id)).toEqual(["1", "3"]);
    expect(messages[1].meta).toMatchObject({ found: false });
    expect(messages[0].meta).toBeNull();
  });

  it("aceita metadata como string JSON (como o servidor devolve) ou inválida", () => {
    const base = { chatId: "c", role: "assistant" as const, content: null, createdAt: NOW };
    const [fromString, broken] = fromServerMessages([
      {
        ...base,
        id: "1",
        metadata: JSON.stringify({ found: false, similar: [{ pageId: "p", title: "T" }] }) as any,
      },
      { ...base, id: "2", metadata: "{não é json" as any },
    ]);
    expect(fromString.meta).toMatchObject({ found: false, similar: [{ title: "T" }] });
    expect(broken.meta).toBeNull();
  });
});
