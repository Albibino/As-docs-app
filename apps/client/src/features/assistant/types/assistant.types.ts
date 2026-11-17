/** Conversa do assistente (linha de `ai_chats`). */
export type Conversation = {
  id: string;
  workspaceId: string;
  creatorId: string;
  title: string | null;
  createdAt: string;
  updatedAt: string;
};

/** Página citada como fonte ou sugerida como semelhante. */
export type PageRef = {
  pageId: string;
  title: string;
  slugId?: string;
  spaceSlug?: string;
  /** Número da citação `[n]` no texto da resposta. */
  n?: number;
  /** `mcp_read`: a fonte é a versão atual lida do app; `index`: veio do índice. */
  origin?: "index" | "mcp_read";
  version?: number;
};

/** Página cujo índice vetorial está atrás da versão atual. */
export type StalePage = {
  pageId: string;
  title: string;
  indexedVersion: number | null;
  currentVersion: number;
};

/** Metadados gravados pelo servidor junto da resposta do assistente. */
export type AnswerMeta = {
  found?: boolean;
  sources?: PageRef[];
  similar?: PageRef[];
  stalePages?: StalePage[];
};

export type ChatRole = "user" | "assistant" | "tool";

export type ChatMessage = {
  id: string;
  role: ChatRole;
  content: string | null;
  /** Só existe em respostas do assistente. */
  meta: AnswerMeta | null;
  createdAt: string;
};

/** Mensagem como o servidor devolve em `/ai/chats/info`. */
export type ServerMessage = {
  id: string;
  chatId: string;
  role: ChatRole;
  content: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};

/** Eventos SSE de `POST /api/ai/chats/send`. */
export type StreamEvent =
  | { type: "chat_created"; chatId: string }
  | { type: "freshness"; stalePages: StalePage[]; checked: boolean }
  | { type: "sources"; sources: PageRef[] }
  | { type: "content"; text: string }
  | { type: "not_found"; similar: PageRef[] }
  | { type: "done"; messageId: string; found?: boolean }
  | { type: "error"; message?: string; code?: string; retryable?: boolean };

export type SendParams = {
  chatId?: string;
  content: string;
  contextPageId?: string;
};

/** Falha da conversa; a interface mostra um texto próprio para cada tipo. */
export type AssistantError = {
  kind: "unavailable" | "failed" | "interrupted";
};
