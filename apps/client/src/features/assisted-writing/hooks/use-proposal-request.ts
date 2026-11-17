import type { Editor } from "@tiptap/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAtomValue } from "jotai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  useAvailableLabelsQuery,
  usePageLabelsQuery,
} from "@/features/label/queries/label-query";
import { usePageQuery } from "@/features/page/queries/page-query";
import { currentUserAtom } from "@/features/user/atoms/current-user-atom.ts";
import {
  changedBlocksSinceSnapshot,
  prepareGenerationContext,
  type GenerationBlock,
  type ProposalOperation,
} from "../domain/assisted-writing";
import {
  getAvailableLabelNames,
  getPageLabelNames,
} from "../domain/label-context";
import {
  buildSpacePageIndex,
  normalizeProposalOperations,
  type SpacePageRef,
} from "../domain/page-links";
import {
  fetchSpacePages,
  streamAssistedWriting,
  type GenerationStreamResult,
} from "../services/assisted-writing-service";
import type { ChatTurn, WritingSession } from "../types";

export interface ProposalState {
  status: "idle" | "streaming" | "proposal" | "nothing" | "failed";
  operations: ProposalOperation[];
  /** Page mentions the model invented; they became plain text. */
  unresolvedLinks: string[];
  /** Operations received so far while streaming. */
  received: number;
  /** Why the model decided to change nothing. */
  reason?: string;
  error?: string;
  usage?: GenerationStreamResult["usage"];
  meta?: GenerationStreamResult["meta"];
}

const IDLE: ProposalState = {
  status: "idle",
  operations: [],
  unresolvedLinks: [],
  received: 0,
};

interface Options {
  editor: Editor | null;
  pageId: string;
  open: boolean;
  session: WritingSession;
  onTurn: (turn: [ChatTurn, ChatTurn], baseline: GenerationBlock[]) => void;
}

/**
 * Sends the user's request with the current page blocks and collects the
 * streamed proposal. The proposal is only exposed once the service has
 * validated the `done` event, so a cut stream never leaves a partial review.
 */
export function useProposalRequest({
  editor,
  pageId,
  open,
  session,
  onTurn,
}: Options) {
  const { t } = useTranslation();
  const [state, setState] = useState<ProposalState>(IDLE);
  const abortRef = useRef<AbortController | undefined>(undefined);
  const queryClient = useQueryClient();
  const currentUser = useAtomValue(currentUserAtom);
  const { data: page } = usePageQuery({ pageId });
  const { data: pageLabels } = usePageLabelsQuery(pageId);
  const { data: availableLabels } = useAvailableLabelsQuery(
    page?.spaceId,
    !!page?.spaceId,
  );

  // Same page list the model receives, so a pageId it returns resolves to a
  // real page. Prefetched on open; a submit waits for it because normalizing
  // against an empty index would turn every new link into plain text.
  const spacePages = useMemo(
    () => ({
      queryKey: ["assisted-writing-space-pages", pageId],
      queryFn: () => fetchSpacePages(pageId),
      staleTime: 5 * 60 * 1000,
    }),
    [pageId],
  );
  useQuery({ ...spacePages, enabled: open && !!pageId });

  useEffect(() => () => abortRef.current?.abort(), []);

  const describeFailure = useCallback(
    (cause: any): string => {
      if (cause?.code === "input_budget_exceeded") {
        return t(
          "The page exceeds the AI token limit. Select a smaller excerpt.",
        );
      }
      if (cause?.message === "incomplete_proposal") {
        return t("Incomplete proposal discarded.");
      }
      return t("Something went wrong. Please try again.");
    },
    [t],
  );

  const submit = useCallback(
    async (request: string, focusBlockIds: string[]) => {
      if (!editor || !request.trim() || state.status === "streaming") return;
      setState({ ...IDLE, status: "streaming" });

      const context = await prepareGenerationContext(
        editor.getJSON(),
        focusBlockIds,
      );
      // The first snapshot of the conversation stays stable in the prompt;
      // only blocks edited since then are sent again in their new form.
      const edited = session.baseline
        ? changedBlocksSinceSnapshot(session.baseline, context.blocks)
        : [];
      const editedIds = new Set(edited.map((block) => block.blockId));
      const blocks = session.baseline
        ? [
            ...session.baseline.filter((block) => !editedIds.has(block.blockId)),
            ...edited,
          ]
        : context.blocks;

      const abort = new AbortController();
      abortRef.current = abort;
      const text = request.trim();
      try {
        const result = await streamAssistedWriting(
          {
            pageId,
            sessionId: session.id,
            request: text,
            blocks,
            selectedBlockIds: context.selectedBlockIds,
            history: session.history,
            title: page?.title ?? undefined,
            labels: getPageLabelNames(pageLabels),
            availableLabels: getAvailableLabelNames(availableLabels),
          },
          {
            signal: abort.signal,
            onEvent: (event) => {
              if (event.event === "operation") {
                setState((s) => ({ ...s, received: s.received + 1 }));
              }
            },
          },
        );

        const index = buildSpacePageIndex(
          await queryClient
            .ensureQueryData(spacePages)
            .catch(() => [] as SpacePageRef[]),
        );
        const { operations, unresolved } = normalizeProposalOperations(
          result.operations,
          index,
          currentUser?.user.id,
        );
        const nothing = operations.length === 0;
        const reason = nothing
          ? result.noChangeReason ||
            t("The AI did not propose any change for this request.")
          : undefined;
        setState({
          status: nothing ? "nothing" : "proposal",
          operations,
          unresolvedLinks: unresolved,
          received: operations.length,
          reason,
          usage: result.usage,
          meta: result.meta,
        });
        onTurn(
          [
            { role: "user", content: text },
            {
              role: "assistant",
              content: nothing
                ? JSON.stringify({
                    action: "none",
                    reason: result.noChangeReason ?? "",
                  })
                : JSON.stringify(operations),
            },
          ],
          context.blocks,
        );
      } catch (cause) {
        // A request the user (or an unmount) cancelled is not an error.
        setState(
          abort.signal.aborted
            ? IDLE
            : { ...IDLE, status: "failed", error: describeFailure(cause) },
        );
      } finally {
        abortRef.current = undefined;
      }
    },
    [
      availableLabels,
      currentUser,
      describeFailure,
      editor,
      onTurn,
      page,
      pageId,
      pageLabels,
      queryClient,
      session,
      spacePages,
      state.status,
      t,
    ],
  );

  /** Drops the proposal under review (or the last error/notice). */
  const clear = useCallback(() => setState(IDLE), []);
  const cancel = useCallback(() => abortRef.current?.abort(), []);

  return { state, submit, clear, cancel };
}
