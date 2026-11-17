import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteConversation,
  getConversation,
  listConversations,
  renameConversation,
  searchConversations,
} from "../services/assistant-service";

export const CONVERSATIONS_KEY = ["assistant-conversations"] as const;

export function useConversationsQuery() {
  return useQuery({
    queryKey: CONVERSATIONS_KEY,
    queryFn: () => listConversations(),
  });
}

export function useConversationSearch(query: string) {
  return useQuery({
    queryKey: ["assistant-conversation-search", query],
    queryFn: () => searchConversations(query),
    enabled: query.length > 0,
  });
}

export function useConversationQuery(chatId: string | undefined) {
  return useQuery({
    queryKey: ["assistant-conversation", chatId],
    queryFn: () => getConversation(chatId!),
    enabled: !!chatId,
    retry: false,
  });
}

export function useRenameConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { chatId: string; title: string }) =>
      renameConversation(vars.chatId, vars.title),
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
      queryClient.invalidateQueries({
        queryKey: ["assistant-conversation", vars.chatId],
      });
    },
  });
}

export function useDeleteConversation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (chatId: string) => deleteConversation(chatId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: CONVERSATIONS_KEY });
    },
  });
}
