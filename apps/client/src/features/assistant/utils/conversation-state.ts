import type {
  AnswerMeta,
  AssistantError,
  ChatMessage,
  ServerMessage,
  StreamEvent,
} from "../types/assistant.types";

/** Resposta em andamento (ainda não gravada como mensagem). */
export type Draft = { text: string; meta: AnswerMeta };

export type ConversationState = {
  messages: ChatMessage[];
  /** `null` quando não há geração em curso. */
  draft: Draft | null;
  error: AssistantError | null;
};

export const initialConversationState: ConversationState = {
  messages: [],
  draft: null,
  error: null,
};

export type ConversationAction =
  | { type: "reset" }
  | { type: "load"; messages: ChatMessage[] }
  | { type: "ask"; message: ChatMessage }
  | { type: "event"; event: StreamEvent; now: string }
  | { type: "stop"; now: string; id: string }
  | { type: "failed"; error: AssistantError }
  | { type: "closed"; now: string; id: string };

/**
 * O servidor grava `metadata` como JSON em texto dentro da coluna jsonb, então
 * ela chega como string; aceita também o objeto já decodificado.
 */
function parseMeta(raw: unknown): AnswerMeta | null {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw && typeof raw === "object" ? (raw as AnswerMeta) : null;
}

/** Converte as mensagens do servidor (sem as de ferramenta) para o modelo local. */
export function fromServerMessages(messages: ServerMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.role === "user" || m.role === "assistant")
    .map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      meta: m.role === "assistant" ? parseMeta(m.metadata) : null,
      createdAt: m.createdAt,
    }));
}

function finishDraft(
  state: ConversationState,
  id: string,
  now: string,
  patch: Partial<ConversationState> = {},
): ConversationState {
  const { draft } = state;
  const messages =
    draft && draft.text
      ? [
          ...state.messages,
          {
            id,
            role: "assistant" as const,
            content: draft.text,
            meta: draft.meta,
            createdAt: now,
          },
        ]
      : state.messages;
  return { ...state, messages, draft: null, ...patch };
}

function errorKind(code?: string): AssistantError["kind"] {
  return code === "ai_unavailable" || code === "http_503"
    ? "unavailable"
    : "failed";
}

export function failureFromStatus(status?: number): AssistantError {
  return { kind: status === 503 ? "unavailable" : "failed" };
}

export function conversationReducer(
  state: ConversationState,
  action: ConversationAction,
): ConversationState {
  switch (action.type) {
    case "reset":
      return initialConversationState;
    case "load":
      return { messages: action.messages, draft: null, error: null };
    case "ask":
      return {
        messages: [...state.messages, action.message],
        draft: { text: "", meta: {} },
        error: null,
      };
    case "event":
      return applyEvent(state, action.event, action.now);
    case "stop":
      return finishDraft(state, action.id, action.now);
    case "failed":
      return { ...state, draft: null, error: action.error };
    case "closed":
      // O servidor fechou o fluxo sem enviar `done`: guarda o que chegou.
      return state.draft
        ? finishDraft(state, action.id, action.now, {
            error: { kind: "interrupted" },
          })
        : state;
  }
}

function applyEvent(
  state: ConversationState,
  event: StreamEvent,
  now: string,
): ConversationState {
  const { draft } = state;
  switch (event.type) {
    case "freshness":
      return draft
        ? {
            ...state,
            draft: {
              ...draft,
              meta: { ...draft.meta, stalePages: event.stalePages },
            },
          }
        : state;
    case "sources":
      return draft
        ? {
            ...state,
            draft: { ...draft, meta: { ...draft.meta, sources: event.sources } },
          }
        : state;
    case "content":
      return draft
        ? { ...state, draft: { ...draft, text: draft.text + event.text } }
        : state;
    case "not_found":
      return draft
        ? {
            ...state,
            draft: {
              ...draft,
              meta: { ...draft.meta, found: false, similar: event.similar },
            },
          }
        : state;
    case "done": {
      if (!draft) return state;
      const found = event.found ?? draft.meta.found ?? true;
      const meta: AnswerMeta = { ...draft.meta, found };
      return {
        ...state,
        draft: null,
        messages: [
          ...state.messages,
          {
            id: event.messageId,
            role: "assistant",
            // Sem evidência o servidor não grava texto.
            content: found ? draft.text || null : null,
            meta,
            createdAt: now,
          },
        ],
      };
    }
    case "error":
      return { ...state, draft: null, error: { kind: errorKind(event.code) } };
    case "chat_created":
      return state;
  }
}
