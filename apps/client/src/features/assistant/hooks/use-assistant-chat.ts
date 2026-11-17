import { useCallback, useEffect, useReducer, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { streamAnswer } from "../services/assistant-service";
import type { ChatMessage, ServerMessage } from "../types/assistant.types";
import {
  conversationReducer,
  failureFromStatus,
  fromServerMessages,
  initialConversationState,
} from "../utils/conversation-state";
import { CONVERSATIONS_KEY } from "../queries/assistant-query";

type Options = {
  /** Conversa aberta; `undefined` = conversa nova. */
  chatId: string | undefined;
  /** Chamado quando o servidor cria a conversa da primeira pergunta. */
  onChatCreated?: (chatId: string) => void;
};

let localId = 0;
const nextLocalId = (prefix: string) => `${prefix}-${Date.now()}-${++localId}`;

/**
 * Estado de uma conversa com o assistente: mensagens, resposta em fluxo,
 * envio e cancelamento. Quem usa o hook carrega o histórico do servidor e o
 * entrega em `loadHistory`.
 */
export function useAssistantChat({ chatId, onChatCreated }: Options) {
  const queryClient = useQueryClient();
  const [state, dispatch] = useReducer(
    conversationReducer,
    initialConversationState,
  );
  const abortRef = useRef<AbortController | null>(null);
  const chatIdRef = useRef(chatId);
  chatIdRef.current = chatId;
  const onCreatedRef = useRef(onChatCreated);
  onCreatedRef.current = onChatCreated;
  // Conversa que o estado local representa. Evita que o histórico do servidor
  // (ou a troca de URL ao criar a conversa) sobrescreva o que já está na tela.
  const syncedRef = useRef<string | undefined>(undefined);
  const streaming = state.draft !== null;
  const streamingRef = useRef(streaming);
  streamingRef.current = streaming;

  useEffect(() => {
    if (chatId && chatId === syncedRef.current) return;
    abortRef.current?.abort();
    abortRef.current = null;
    syncedRef.current = undefined;
    dispatch({ type: "reset" });
  }, [chatId]);

  const loadHistory = useCallback((messages: ServerMessage[]) => {
    const current = chatIdRef.current;
    if (!current || syncedRef.current === current) return;
    syncedRef.current = current;
    dispatch({ type: "load", messages: fromServerMessages(messages) });
  }, []);

  const send = useCallback(
    (content: string, contextPageId?: string) => {
      const text = content.trim();
      if (!text || streamingRef.current) return false;

      const message: ChatMessage = {
        id: nextLocalId("local-user"),
        role: "user",
        content: text,
        meta: null,
        createdAt: new Date().toISOString(),
      };
      streamingRef.current = true;
      dispatch({ type: "ask", message });

      const controller = new AbortController();
      abortRef.current = controller;
      const live = () => abortRef.current === controller;

      void streamAnswer(
        {
          chatId: chatIdRef.current,
          content: text,
          ...(contextPageId ? { contextPageId } : {}),
        },
        {
          onEvent: (event) => {
            if (!live()) return;
            if (event.type === "chat_created") {
              chatIdRef.current = event.chatId;
              syncedRef.current = event.chatId;
              onCreatedRef.current?.(event.chatId);
              queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
              return;
            }
            dispatch({
              type: "event",
              event,
              now: new Date().toISOString(),
            });
            if (event.type === "done") {
              abortRef.current = null;
              queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
              queryClient.invalidateQueries({
                queryKey: ["assistant-conversation", chatIdRef.current],
              });
            }
          },
          onFailure: ({ status }) => {
            if (!live()) return;
            abortRef.current = null;
            dispatch({ type: "failed", error: failureFromStatus(status) });
          },
          onComplete: () => {
            if (!live()) return;
            abortRef.current = null;
            dispatch({
              type: "closed",
              now: new Date().toISOString(),
              id: nextLocalId("local-partial"),
            });
          },
        },
        controller.signal,
      );
      return true;
    },
    [queryClient],
  );

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({
      type: "stop",
      now: new Date().toISOString(),
      id: nextLocalId("local-stopped"),
    });
  }, []);

  return {
    messages: state.messages,
    draft: state.draft,
    isStreaming: streaming,
    error: state.error,
    send,
    stop,
    loadHistory,
  };
}
