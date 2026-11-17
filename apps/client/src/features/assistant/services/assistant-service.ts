import api from "@/lib/api-client.ts";
import type {
  Conversation,
  SendParams,
  ServerMessage,
  StreamEvent,
} from "../types/assistant.types";
import { SseParser } from "../utils/sse-parser";

export async function listConversations(limit = 100): Promise<Conversation[]> {
  const res = await api.post("/ai/chats", { limit });
  return res.data?.items ?? [];
}

export async function searchConversations(
  query: string,
): Promise<Conversation[]> {
  const res = await api.post("/ai/chats/search", { query });
  return res.data ?? [];
}

export async function getConversation(
  chatId: string,
): Promise<{ chat: Conversation; messages: ServerMessage[] }> {
  const res = await api.post("/ai/chats/info", { chatId });
  return res.data;
}

export async function renameConversation(
  chatId: string,
  title: string,
): Promise<void> {
  await api.post("/ai/chats/update", { chatId, title });
}

export async function deleteConversation(chatId: string): Promise<void> {
  await api.post("/ai/chats/delete", { chatId });
}

export type StreamHandlers = {
  onEvent: (event: StreamEvent) => void;
  /** A requisição falhou antes ou durante a leitura (exceto cancelamento). */
  onFailure: (failure: { status?: number }) => void;
  /** O fluxo terminou normalmente (o servidor fechou a resposta). */
  onComplete: () => void;
};

function parseEvent(data: string): StreamEvent | null {
  try {
    const parsed = JSON.parse(data);
    return parsed && typeof parsed.type === "string"
      ? (parsed as StreamEvent)
      : null;
  } catch {
    return null;
  }
}

/**
 * Envia a pergunta e lê a resposta em SSE (`data: {...}\n\n`) com o cookie de
 * sessão. Cancelar o `signal` interrompe a leitura sem chamar `onFailure`.
 */
export async function streamAnswer(
  params: SendParams,
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  try {
    const response = await fetch("/api/ai/chats/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(params),
      credentials: "include",
      signal,
    });
    if (!response.ok || !response.body) {
      handlers.onFailure({ status: response.status });
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const parser = new SseParser();
    const emit = (items: string[]) => {
      for (const item of items) {
        const event = parseEvent(item);
        if (event) handlers.onEvent(event);
      }
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        emit(parser.push(decoder.decode(value, { stream: true })));
      }
      emit(parser.push(decoder.decode()));
      emit(parser.flush());
    } finally {
      reader.releaseLock();
    }
    handlers.onComplete();
  } catch (error) {
    if (signal?.aborted || (error as Error)?.name === "AbortError") return;
    handlers.onFailure({});
  }
}
