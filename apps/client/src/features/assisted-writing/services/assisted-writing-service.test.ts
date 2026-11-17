import { afterEach, describe, expect, it, vi } from "vitest";
import { SseParser, streamAssistedWriting } from "./assisted-writing-service";

describe("AI service SSE parser", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("parses event names and frames split across chunks", () => {
    const events: any[] = [];
    const parser = new SseParser((event) => events.push(event));
    parser.push("event: met");
    parser.push('a\ndata: {"inputTokens":12}');
    parser.push('\n\nevent: done\ndata: {"operationCount":0}\n\n');
    parser.finish();
    expect(events).toEqual([
      { event: "meta", data: { inputTokens: 12 } },
      { event: "done", data: { operationCount: 0 } },
    ]);
  });

  it("discards partial operations after typed error", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: operation\ndata: {"action":"delete","blockId":"p1","baseHash":"x"}\n\n' +
              'event: error\ndata: {"code":"invalid_operation"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    await expect(
      streamAssistedWriting({
        pageId: "page",
        sessionId: crypto.randomUUID(),
        request: "x",
        blocks: [],
      }),
    ).rejects.toMatchObject({ code: "invalid_operation" });
  });

  it("requires done and matching operation count", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: done\ndata: {"operationCount":1}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    await expect(
      streamAssistedWriting({
        pageId: "page",
        sessionId: crypto.randomUUID(),
        request: "x",
        blocks: [],
      }),
    ).rejects.toThrow("operation_count_mismatch");
  });

  function sseResponse(text: string) {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(text));
        controller.close();
      },
    });
    return new Response(body, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  }

  it("returns the reason when the AI decides not to change anything", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(
          'event: meta\ndata: {"inputTokens":10}\n\n' +
            'event: done\ndata: {"operationCount":0,"noChangeReason":"É uma pergunta."}\n\n',
        ),
      ),
    );
    const result = await streamAssistedWriting({
      pageId: "page",
      sessionId: crypto.randomUUID(),
      request: "Qual é a capital da França?",
      blocks: [],
    });
    expect(result.operations).toEqual([]);
    expect(result.noChangeReason).toBe("É uma pergunta.");
  });

  it("rejects a no-change reason together with operations", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        sseResponse(
          'event: operation\ndata: {"action":"delete","blockId":"p1","baseHash":"h"}\n\n' +
            'event: done\ndata: {"operationCount":1,"noChangeReason":"x"}\n\n',
        ),
      ),
    );
    await expect(
      streamAssistedWriting({
        pageId: "page",
        sessionId: crypto.randomUUID(),
        request: "x",
        blocks: [],
      }),
    ).rejects.toThrow("invalid_stream_event");
  });

  it("rejects invalid operation format", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'event: operation\ndata: {"action":"replace","blockId":"p1"}\n\n',
          ),
        );
        controller.close();
      },
    });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(body, {
          status: 200,
          headers: { "content-type": "text/event-stream" },
        }),
      ),
    );
    await expect(
      streamAssistedWriting({
        pageId: "page",
        sessionId: crypto.randomUUID(),
        request: "x",
        blocks: [],
      }),
    ).rejects.toThrow("invalid_stream_event");
  });

  it("propagates cancellation", async () => {
    const abort = new AbortController();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () =>
              reject(new DOMException("Aborted", "AbortError")),
            );
          }),
      ),
    );
    const pending = streamAssistedWriting(
      {
        pageId: "page",
        sessionId: crypto.randomUUID(),
        request: "x",
        blocks: [],
      },
      { signal: abort.signal },
    );
    abort.abort();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });
});
