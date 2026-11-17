import { afterEach, describe, expect, it, vi } from "vitest";
import { streamAnswer } from "./assistant-service";
import type { StreamEvent } from "../types/assistant.types";

vi.mock("@/lib/api-client.ts", () => ({ default: { post: vi.fn() } }));

const encoder = new TextEncoder();

/** Resposta fake cujo corpo entrega os pedaços de texto informados. */
function sseResponse(chunks: string[], init: { ok?: boolean; status?: number } = {}) {
  let i = 0;
  return {
    ok: init.ok ?? true,
    status: init.status ?? 200,
    body: {
      getReader: () => ({
        read: async () =>
          i < chunks.length
            ? { done: false, value: encoder.encode(chunks[i++]) }
            : { done: true, value: undefined },
        releaseLock: () => {},
      }),
    },
  };
}

function run(response: unknown, signal?: AbortSignal) {
  const fetchMock = vi.fn().mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
  const events: StreamEvent[] = [];
  const onFailure = vi.fn();
  const onComplete = vi.fn();
  const done = streamAnswer(
    { chatId: "c1", content: "Oi", contextPageId: "p1" },
    { onEvent: (e) => events.push(e), onFailure, onComplete },
    signal,
  );
  return { fetchMock, events, onFailure, onComplete, done };
}

afterEach(() => vi.unstubAllGlobals());

describe("streamAnswer", () => {
  it("posta a pergunta com cookie e entrega os eventos na ordem", async () => {
    const wire = [
      'data: {"type":"chat_created","chatId":"c1"}\n\n',
      'data: {"type":"freshness","checked":true,"stalePages":[]}\n\ndata: {"type":"sou',
      'rces","sources":[{"pageId":"p1","title":"Férias"}]}\n\n',
      'data: {"type":"content","text":"Com 45 dias "}\n\ndata: {"type":"content","text":"[1]."}\n\n',
      'data: {"type":"done","messageId":"m1","found":true}\n\n',
    ];
    const { fetchMock, events, onComplete, onFailure, done } = run(sseResponse(wire));
    await done;

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/ai/chats/send");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("include");
    expect(JSON.parse(init.body)).toEqual({
      chatId: "c1",
      content: "Oi",
      contextPageId: "p1",
    });
    expect(events.map((e) => e.type)).toEqual([
      "chat_created",
      "freshness",
      "sources",
      "content",
      "content",
      "done",
    ]);
    expect(events[2]).toMatchObject({ sources: [{ title: "Férias" }] });
    expect(onComplete).toHaveBeenCalledOnce();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("entrega not_found e error, ignorando linhas que não são JSON", async () => {
    const { events, done } = run(
      sseResponse([
        "data: não é json\n\n",
        'data: {"type":"not_found","similar":[{"pageId":"p2","title":"Bônus"}]}\n\n',
        'data: {"type":"error","code":"ai_unavailable","retryable":true}\n\n',
      ]),
    );
    await done;
    expect(events).toEqual([
      { type: "not_found", similar: [{ pageId: "p2", title: "Bônus" }] },
      { type: "error", code: "ai_unavailable", retryable: true },
    ]);
  });

  it("lê o último evento mesmo sem a linha em branco final", async () => {
    const { events, done } = run(
      sseResponse(['data: {"type":"done","messageId":"m9"}']),
    );
    await done;
    expect(events).toEqual([{ type: "done", messageId: "m9" }]);
  });

  it("avisa a falha HTTP com o status", async () => {
    const { onFailure, onComplete, done } = run(
      sseResponse([], { ok: false, status: 503 }),
    );
    await done;
    expect(onFailure).toHaveBeenCalledWith({ status: 503 });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("não trata o cancelamento como falha", async () => {
    const controller = new AbortController();
    const fetchMock = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error("abort"), { name: "AbortError" }));
    vi.stubGlobal("fetch", fetchMock);
    const onFailure = vi.fn();
    const onComplete = vi.fn();
    controller.abort();
    await streamAnswer(
      { content: "x" },
      { onEvent: vi.fn(), onFailure, onComplete },
      controller.signal,
    );
    expect(onFailure).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  it("falha de rede vira onFailure sem status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const onFailure = vi.fn();
    await streamAnswer(
      { content: "x" },
      { onEvent: vi.fn(), onFailure, onComplete: vi.fn() },
    );
    expect(onFailure).toHaveBeenCalledWith({});
  });
});
