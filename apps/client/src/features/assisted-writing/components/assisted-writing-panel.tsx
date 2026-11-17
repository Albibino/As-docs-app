import type { Editor } from "@tiptap/react";
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Tooltip,
} from "@mantine/core";
import {
  IconCheck,
  IconHistory,
  IconSparkles,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useAtom } from "jotai";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { showAiMenuAtom } from "@/features/editor/atoms/editor-atoms";
import {
  applyLinkDecisions,
  summarizePageLinkChanges,
  type LinkDecision,
  type PageLinkChange,
} from "../domain/page-links";
import { assistantSummary, type Translate } from "../domain/operation-label";
import { useApplyProposal } from "../hooks/use-apply-proposal";
import { usePageMetadata } from "../hooks/use-page-metadata";
import { useProposalRequest } from "../hooks/use-proposal-request";
import { useSelectionAnchor } from "../hooks/use-selection-anchor";
import { isUndoAvailable, useUndo } from "../hooks/use-undo";
import { useWritingSession } from "../hooks/use-writing-session";
import { closeServerSession } from "../services/session-api";
import classes from "../assisted-writing.module.css";
import { AiLinkReviewModal } from "./ai-link-review-modal";
import { Composer } from "./composer";
import { EditedBlocksNotice } from "./edited-blocks-notice";
import { ProposalList } from "./proposal-card";

interface AssistedWritingPanelProps {
  editor: Editor | null;
  pageId?: string;
}

/**
 * Side panel of the page editor where the user asks the AI for changes to the
 * open page, reviews the proposed block changes and accepts, refuses or undoes
 * them. The conversation is kept per page, hence the remount on page change.
 */
export function AssistedWritingPanel({
  editor,
  pageId,
}: AssistedWritingPanelProps) {
  if (!pageId) return null;
  return <PagePanel key={pageId} editor={editor} pageId={pageId} />;
}

function PagePanel({ editor, pageId }: { editor: Editor | null; pageId: string }) {
  const { t } = useTranslation();
  const [open, setOpen] = useAtom(showAiMenuAtom);
  const [prompt, setPrompt] = useState("");
  const [focusSelection, setFocusSelection] = useState(false);
  const [applying, setApplying] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [undoError, setUndoError] = useState("");
  const [linkChanges, setLinkChanges] = useState<PageLinkChange[]>([]);

  const selection = useSelectionAnchor(editor);
  const { session, recordTurn, setUndo, restart } = useWritingSession(pageId);
  const metadata = usePageMetadata(pageId);
  const request = useProposalRequest({
    editor,
    pageId,
    open,
    session,
    onTurn: recordTurn,
  });
  const apply = useApplyProposal({
    editor,
    pageId,
    sessionId: session.id,
    metadata,
  });
  const undo = useUndo({
    editor,
    undo: session.undo,
    metadata,
    setUndo,
    onFailure: setUndoError,
  });

  const { state } = request;
  const streaming = state.status === "streaming";
  const reviewing = state.status === "proposal";

  useEffect(() => {
    document.body.classList.toggle("assisted-writing-open", open);
    return () => document.body.classList.remove("assisted-writing-open");
  }, [open]);

  // Focusing on the selection only makes sense while something is selected.
  useEffect(() => {
    if (selection.blockIds.length === 0) setFocusSelection(false);
  }, [selection.blockIds.length]);

  const resetNotices = useCallback(() => {
    setProblems([]);
    setUndoError("");
  }, []);

  const send = async () => {
    if (!prompt.trim() || streaming) return;
    const text = prompt;
    resetNotices();
    undo.dismissWarning();
    setPrompt("");
    await request.submit(text, focusSelection ? selection.blockIds : []);
  };

  const applyOperations = async (operations: typeof state.operations) => {
    setApplying(true);
    try {
      const outcome = await apply(operations);
      setProblems(outcome.conflicts);
      if (outcome.undo) setUndo(outcome.undo);
      request.clear();
    } finally {
      setApplying(false);
    }
  };

  // A proposal that changes the page's links goes through the review first:
  // a link the model dropped on its own would otherwise disappear silently.
  const accept = () => {
    if (!editor || !reviewing) return;
    // Read the document now: a collaborator may have edited a block since the
    // proposal arrived, and a stale diff would hide a link change.
    const blocks = new Map<string, any>();
    for (const node of (editor.getJSON().content ?? []) as any[]) {
      if (node.attrs?.id) blocks.set(node.attrs.id, node);
    }
    const changes = summarizePageLinkChanges(state.operations, blocks);
    if (changes.length) {
      setLinkChanges(changes);
      return;
    }
    void applyOperations(state.operations);
  };

  const confirmLinks = (decisions: LinkDecision[]) => {
    const reviewed = applyLinkDecisions(state.operations, decisions);
    setLinkChanges([]);
    if (!reviewed.length) {
      // Keeping every link of a delete-only proposal cancels all of it.
      request.clear();
      setProblems([t("Proposal discarded: all links were kept.")]);
      return;
    }
    void applyOperations(reviewed);
  };

  const refuse = () => {
    request.clear();
    resetNotices();
    setLinkChanges([]);
  };

  const endConversation = async () => {
    request.cancel();
    await closeServerSession(pageId, session.id);
    restart();
    refuse();
    setOpen(false);
  };

  const showEmpty =
    session.history.length === 0 && state.status === "idle" && !undoError;
  const lastTurnIsNothing = state.status === "nothing";

  return (
    <>
      <Tooltip label={t("Assisted writing")}>
        <ActionIcon
          className={classes.launcher}
          size="lg"
          radius="xl"
          aria-label={t("Open assisted writing")}
          onClick={() => setOpen(!open)}
        >
          <IconSparkles size={20} />
        </ActionIcon>
      </Tooltip>

      {selection.position && !(open && focusSelection) && (
        <Button
          className={classes.selectionButton}
          style={selection.position}
          size="xs"
          leftSection={<IconSparkles size={14} />}
          // Keep the editor selection alive while clicking.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setFocusSelection(true);
            setOpen(true);
          }}
        >
          {t("Ask AI about selection")}
        </Button>
      )}

      {open && (
        <Paper component="aside" shadow="xl" radius={0} className={classes.panel}>
          <Group gap={4} wrap="nowrap" className={classes.header}>
            <IconSparkles size={16} stroke={1.75} />
            <Text size="sm" fw={600} style={{ flex: 1 }}>
              {t("Assisted writing")}
            </Text>
            <Tooltip label={t("End conversation")} openDelay={250}>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={t("End conversation")}
                onClick={endConversation}
              >
                <IconTrash size={16} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
            <Tooltip label={t("Close")} openDelay={250}>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={t("Close")}
                onClick={() => setOpen(false)}
              >
                <IconX size={18} stroke={1.75} />
              </ActionIcon>
            </Tooltip>
          </Group>

          <Stack gap="sm" className={classes.thread}>
            {showEmpty && (
              <Stack gap="xs" align="center" className={classes.empty}>
                <IconSparkles size={32} stroke={1.5} />
                <Text fw={500}>{t("How can I help with this page?")}</Text>
              </Stack>
            )}

            {focusSelection && selection.blockIds.length > 0 && (
              <Badge variant="light" style={{ alignSelf: "flex-start" }}>
                {t("{{total}} block(s) selected", {
                  total: selection.blockIds.length,
                })}
              </Badge>
            )}

            {state.error && <Alert color="red">{state.error}</Alert>}
            {undoError && <Alert color="red">{undoError}</Alert>}
            {problems.length > 0 && (
              <Alert color="orange" title={t("Changes not applied")}>
                {problems.map((item) => (
                  <Text key={item} size="sm">
                    {item}
                  </Text>
                ))}
              </Alert>
            )}
            {state.unresolvedLinks.length > 0 && (
              <Alert color="orange" title={t("Links discarded")}>
                <Text size="sm">
                  {t(
                    "The AI pointed to pages that do not exist. They became plain text:",
                  )}
                </Text>
                {state.unresolvedLinks.map((label, index) => (
                  <Text key={`${label}-${index}`} size="xs">
                    {label || t("(untitled)")}
                  </Text>
                ))}
              </Alert>
            )}

            {session.history.map((turn, index) => {
              if (turn.role === "user") {
                return (
                  <Text key={index} size="sm" className={classes.question}>
                    {turn.content}
                  </Text>
                );
              }
              // The reason of a "no change" answer is shown in the alert below.
              if (lastTurnIsNothing && index === session.history.length - 1) {
                return null;
              }
              return (
                <Text key={index} size="sm" c="dimmed" className={classes.answer}>
                  {assistantSummary(turn.content, t as Translate)}
                </Text>
              );
            })}

            {lastTurnIsNothing && (
              <Alert color="gray" title={t("No changes proposed")}>
                {state.reason}
              </Alert>
            )}

            {streaming && (
              <Stack gap={4} align="center">
                <Loader size="sm" />
                {state.received > 0 && (
                  <Text size="xs" c="dimmed">
                    {t("{{total}} change(s) received…", {
                      total: state.received,
                    })}
                  </Text>
                )}
                <Button size="compact-xs" variant="subtle" onClick={request.cancel}>
                  {t("Stop")}
                </Button>
              </Stack>
            )}

            {reviewing && (
              <>
                <ProposalList editor={editor} operations={state.operations} />
                <Group grow>
                  <Button
                    color="red"
                    variant="light"
                    leftSection={<IconTrash size={16} />}
                    disabled={applying}
                    onClick={refuse}
                  >
                    {t("Refuse")}
                  </Button>
                  <Button
                    leftSection={<IconCheck size={16} />}
                    loading={applying}
                    onClick={accept}
                  >
                    {t("Accept safe changes")}
                  </Button>
                </Group>
              </>
            )}

            {isUndoAvailable(session.undo) && (
              <Button
                variant="light"
                leftSection={<IconHistory size={16} />}
                onClick={() => {
                  setUndoError("");
                  void undo.start();
                }}
              >
                {t("Undo AI application")}
              </Button>
            )}
            {undo.editedSince.length > 0 && (
              <EditedBlocksNotice
                blocks={undo.editedSince}
                onRevertUntouched={undo.revertUntouchedBlocks}
                onRestoreAll={undo.restoreWholePage}
                onCancel={undo.dismissWarning}
              />
            )}

            {(state.meta || state.usage) && (
              <Text size="xs" c="dimmed">
                {t("diagnostics — input: {{input}}; cache: {{cache}}; output: {{output}}", {
                  input: state.usage?.inputTokens ?? state.meta?.inputTokens ?? 0,
                  cache: state.usage?.cachedInputTokens ?? 0,
                  output: state.usage?.outputTokens ?? 0,
                })}
              </Text>
            )}
          </Stack>

          <Composer
            value={prompt}
            onChange={setPrompt}
            onSubmit={send}
            busy={streaming}
            focusedOnSelection={focusSelection}
          />
        </Paper>
      )}

      <AiLinkReviewModal
        opened={linkChanges.length > 0}
        changes={linkChanges}
        onCancel={() => setLinkChanges([])}
        onConfirm={confirmLinks}
      />
    </>
  );
}
