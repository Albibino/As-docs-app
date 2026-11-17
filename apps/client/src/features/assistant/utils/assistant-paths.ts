// O assistente vive na home: "/home" abre uma conversa nova e
// "/home/chat/:chatId" uma conversa existente. Os caminhos antigos "/ai" e
// "/ai/chat/:chatId" redirecionam para cá.
export const NEW_CHAT_PATH = "/home";
export const CHAT_ROUTE_PATTERN = "/home/chat/:chatId";

export function chatPath(chatId: string): string {
  return `/home/chat/${chatId}`;
}

/** Link para uma página citada; sem slug/espaço não há como abrir. */
export function pageHref(page: {
  spaceSlug?: string;
  slugId?: string;
}): string | undefined {
  return page.spaceSlug && page.slugId
    ? `/s/${page.spaceSlug}/p/${page.slugId}`
    : undefined;
}
