import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ActionIcon, VisuallyHidden } from "@mantine/core";
import { IconArrowDown } from "@tabler/icons-react";
import type { ChatMessage } from "../types/assistant.types";
import type { Draft } from "../utils/conversation-state";
import MessageBubble from "./message-bubble";
import classes from "../styles/assistant.module.css";

const NEAR_BOTTOM_PX = 48;

type Props = {
  messages: ChatMessage[];
  draft: Draft | null;
};

/** Transcrição da conversa; acompanha o fim enquanto a resposta chega. */
export default function MessageList({ messages, draft }: Props) {
  const { t } = useTranslation();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const scrollToEnd = useCallback((smooth: boolean) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: smooth ? "smooth" : "auto",
    });
    followRef.current = true;
    setShowJump(false);
  }, []);

  const onScroll = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    followRef.current = distance <= NEAR_BOTTOM_PX;
    setShowJump(!followRef.current);
  }, []);

  const last = messages[messages.length - 1];
  useEffect(() => {
    // A pergunta recém-enviada sempre leva ao fim; o resto só se já estava lá.
    if (last?.role === "user" || followRef.current) scrollToEnd(false);
  }, [messages.length, draft?.text, draft?.meta, last?.role, scrollToEnd]);

  // Anúncio único para leitores de tela (não a cada trecho recebido).
  const announcement = draft
    ? t("AI is thinking...")
    : last?.role === "assistant"
      ? (last.content ?? "").replace(/[#*_`~]/g, "")
      : "";

  return (
    <div className={classes.listWrapper}>
      <VisuallyHidden role="status" aria-live="polite">
        {announcement}
      </VisuallyHidden>
      <div
        ref={scrollerRef}
        className={classes.list}
        onScroll={onScroll}
        aria-label={t("Chat transcript")}
        role="log"
      >
        {messages.map((message) => (
          <MessageBubble key={message.id} message={message} />
        ))}
        {draft && (
          <MessageBubble
            message={{
              role: "assistant",
              content: draft.text || null,
              meta: draft.meta,
            }}
            streaming
          />
        )}
      </div>
      {showJump && (
        <ActionIcon
          className={classes.jumpButton}
          variant="default"
          radius="xl"
          aria-label={t("Scroll to bottom")}
          onClick={() => scrollToEnd(true)}
        >
          <IconArrowDown size={16} />
        </ActionIcon>
      )}
    </div>
  );
}
