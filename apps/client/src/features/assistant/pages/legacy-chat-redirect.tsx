import { Navigate, useParams } from "react-router-dom";
import { chatPath, NEW_CHAT_PATH } from "../utils/assistant-paths";

/** Links antigos "/ai/chat/:chatId" abrem a conversa na home. */
export default function LegacyChatRedirect() {
  const { chatId } = useParams<{ chatId: string }>();
  return <Navigate to={chatId ? chatPath(chatId) : NEW_CHAT_PATH} replace />;
}
