import type { Editor } from "@tiptap/react";
import { Paper, Stack, Text } from "@mantine/core";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  isPageOperation,
  type ProposalOperation,
} from "../domain/assisted-writing";
import { operationLabel, type Translate } from "../domain/operation-label";
import { plainText } from "../text";
import classes from "../assisted-writing.module.css";

interface ProposalListProps {
  editor: Editor | null;
  operations: ProposalOperation[];
}

/**
 * One card per proposed operation: what it does, the current text struck
 * through and the proposed text highlighted.
 */
export function ProposalList({ editor, operations }: ProposalListProps) {
  const { t } = useTranslation();

  // Current top-level blocks by id, read when the proposal arrives.
  const current = useMemo(() => {
    const byId = new Map<string, any>();
    for (const node of (editor?.getJSON().content ?? []) as any[]) {
      if (node.attrs?.id) byId.set(node.attrs.id, node);
    }
    return byId;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, operations]);

  const describe = (blockId: string) => {
    const node = current.get(blockId);
    return node ? { type: node.type, text: plainText(node) } : undefined;
  };

  return (
    <>
      {operations.map((operation, index) => {
        const label = operationLabel(operation, describe, t as Translate);
        const before =
          isPageOperation(operation) || operation.action === "insert_after"
            ? undefined
            : current.get(operation.blockId);
        const after =
          !isPageOperation(operation) && operation.action !== "delete"
            ? plainText({ content: operation.content }) ||
              t("[proposed structure]")
            : undefined;
        return (
          <Paper key={index} withBorder p="sm" radius="md">
            <Stack gap={6} className={classes.change}>
              <Text size="xs" fw={600} c="dimmed" tt="uppercase" className={classes.changeKind}>
                {label}
              </Text>
              {before && (
                <Text size="sm" className={classes.before}>
                  {plainText(before) || t("[block]")}
                </Text>
              )}
              {after && (
                <Text size="sm" className={classes.after}>
                  {after}
                </Text>
              )}
            </Stack>
          </Paper>
        );
      })}
    </>
  );
}
