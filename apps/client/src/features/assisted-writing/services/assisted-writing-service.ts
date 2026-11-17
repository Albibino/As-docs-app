import type {
  GenerationRequest,
  ProposalOperation,
} from "../domain/assisted-writing";
import type { SpacePageRef } from "../domain/page-links";

export type GenerationStreamEvent =
  | { event: "meta"; data: { inputTokens: number } }
  | { event: "operation"; data: ProposalOperation }
  | {
      event: "usage";
      data: {
        inputTokens: number;
        cachedInputTokens: number;
        outputTokens: number;
      };
    }
  | { event: "done"; data: { operationCount: number; noChangeReason?: string } }
  | { event: "error"; data: { code: string; message?: string } };

export class SseParser {
  private buffer = "";
  private eventName = "message";
  private dataLines: string[] = [];

  constructor(
    private readonly onEvent: (event: { event: string; data: unknown }) => void,
  ) {}

  push(chunk: string) {
    this.buffer += chunk.replace(/\r\n/g, "\n");
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline);
      this.buffer = this.buffer.slice(newline + 1);
      this.consumeLine(line);
      newline = this.buffer.indexOf("\n");
    }
  }

  finish() {
    if (this.buffer) this.consumeLine(this.buffer);
    this.buffer = "";
    this.dispatch();
  }

  private consumeLine(line: string) {
    if (!line) {
      this.dispatch();
      return;
    }
    if (line.startsWith(":")) return;
    const colon = line.indexOf(":");
    const field = colon < 0 ? line : line.slice(0, colon);
    let value = colon < 0 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);
    if (field === "event") this.eventName = value;
    if (field === "data") this.dataLines.push(value);
  }

  private dispatch() {
    if (!this.dataLines.length) {
      this.eventName = "message";
      return;
    }
    const raw = this.dataLines.join("\n");
    const event = this.eventName;
    this.eventName = "message";
    this.dataLines = [];
    this.onEvent({ event, data: JSON.parse(raw) });
  }
}

export interface GenerationStreamResult {
  operations: ProposalOperation[];
  /** A IA decidiu não alterar nada (pergunta, informação ausente...). */
  noChangeReason?: string;
  usage?: Extract<GenerationStreamEvent, { event: "usage" }>["data"];
  meta?: Extract<GenerationStreamEvent, { event: "meta" }>["data"];
}

const insertTypes = new Set([
  "paragraph",
  "heading",
  "bulletList",
  "orderedList",
  "taskList",
  "table",
]);

function validatedEvent(event: string, data: any): GenerationStreamEvent {
  if (event === "meta" && Number.isFinite(data?.inputTokens)) {
    return { event, data };
  }
  if (
    event === "usage" &&
    [data?.inputTokens, data?.cachedInputTokens, data?.outputTokens].every(
      Number.isFinite,
    )
  ) {
    return { event, data };
  }
  if (
    event === "done" &&
    Number.isInteger(data?.operationCount) &&
    data.operationCount >= 0 &&
    (data.noChangeReason === undefined ||
      (typeof data.noChangeReason === "string" && data.operationCount === 0))
  ) {
    return { event, data };
  }
  if (event === "error" && typeof data?.code === "string") {
    return { event, data };
  }
  if (event === "operation") {
    const common = typeof data?.action === "string";
    if (
      common &&
      data.action === "replace" &&
      typeof data.blockId === "string" &&
      typeof data.baseHash === "string" &&
      Array.isArray(data.content)
    ) {
      return { event, data };
    }
    if (
      common &&
      data.action === "delete" &&
      typeof data.blockId === "string" &&
      typeof data.baseHash === "string"
    ) {
      return { event, data };
    }
    if (
      common &&
      data.action === "insert_after" &&
      typeof data.afterBlockId === "string" &&
      insertTypes.has(data.blockType) &&
      Array.isArray(data.content)
    ) {
      return { event, data };
    }
    if (
      common &&
      data.action === "set_title" &&
      typeof data.title === "string" &&
      data.title.length > 0
    ) {
      return { event, data };
    }
    if (
      common &&
      (data.action === "add_label" || data.action === "remove_label") &&
      typeof data.label === "string" &&
      data.label.length > 0
    ) {
      return { event, data };
    }
  }
  throw new Error("invalid_stream_event");
}

/**
 * Titles of the pages the model is allowed to link to. Same index the server
 * sends upstream, so a pageId the model returns resolves to the same page here.
 */
export async function fetchSpacePages(pageId: string): Promise<SpacePageRef[]> {
  const response = await fetch("/api/ai/assisted-writing/space-pages", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pageId }),
  });
  if (!response.ok) throw new Error("space_pages_failed");
  const body = await response.json();
  return (body.data ?? body).pages ?? [];
}

export async function streamAssistedWriting(
  request: GenerationRequest,
  callbacks: {
    onEvent?: (event: GenerationStreamEvent) => void;
    signal?: AbortSignal;
  } = {},
): Promise<GenerationStreamResult> {
  const response = await fetch("/api/ai/assisted-writing/stream", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal: callbacks.signal,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const code = error?.error?.code ?? error?.code ?? `http_${response.status}`;
    throw Object.assign(new Error(error?.error?.message ?? code), { code });
  }
  if (!response.body) throw new Error("empty_stream");
  if (!response.headers.get("content-type")?.includes("text/event-stream")) {
    throw new Error("invalid_stream_content_type");
  }

  const operations: ProposalOperation[] = [];
  let usage: GenerationStreamResult["usage"];
  let meta: GenerationStreamResult["meta"];
  let done = false;
  let noChangeReason: string | undefined;
  let terminalEvent = false;
  let streamError: Error | undefined;
  const parser = new SseParser(({ event, data }) => {
    if (terminalEvent) throw new Error("event_after_terminal");
    const parsed = validatedEvent(event, data);
    callbacks.onEvent?.(parsed);
    if (parsed.event === "operation") operations.push(parsed.data);
    if (parsed.event === "usage") usage = parsed.data;
    if (parsed.event === "meta") meta = parsed.data;
    if (parsed.event === "done") {
      terminalEvent = true;
      done = parsed.data.operationCount === operations.length;
      if (!done) streamError = new Error("operation_count_mismatch");
      noChangeReason = parsed.data.noChangeReason;
    }
    if (parsed.event === "error") {
      terminalEvent = true;
      streamError = Object.assign(
        new Error(parsed.data.message ?? parsed.data.code),
        {
          code: parsed.data.code,
        },
      );
    }
  });

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      parser.push(decoder.decode(chunk.value, { stream: true }));
      if (streamError) {
        await reader.cancel(streamError.message);
        throw streamError;
      }
    }
    parser.push(decoder.decode());
    parser.finish();
  } finally {
    reader.releaseLock();
  }

  if (streamError) throw streamError;
  if (!done) throw new Error("incomplete_proposal");
  return {
    operations,
    usage,
    meta,
    ...(noChangeReason !== undefined ? { noChangeReason } : {}),
  };
}
