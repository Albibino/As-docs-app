import type { JSONContent } from "@tiptap/core";
import { v7 as uuid7 } from "uuid";
import { isBlockOperation, type ProposalOperation } from "./assisted-writing";

/** Title-only page reference, as served by /ai/assisted-writing/space-pages. */
export interface SpacePageRef {
  pageId: string;
  slugId: string;
  title: string;
}

export type SpacePageIndex = Map<string, SpacePageRef>;

export function buildSpacePageIndex(pages: SpacePageRef[]): SpacePageIndex {
  return new Map(pages.map((page) => [page.pageId, page]));
}

export interface PageLink {
  entityId: string;
  label: string;
  /** Attributes of the mention node this link came from, kept so it can be restored verbatim. */
  attrs: Record<string, unknown>;
}

function isPageMention(node: JSONContent): boolean {
  return node.type === "mention" && node.attrs?.entityType === "page";
}

function mapNodes(
  content: JSONContent[],
  visit: (node: JSONContent) => JSONContent[],
): JSONContent[] {
  return content.flatMap((node) => {
    const mapped = visit(node);
    return mapped.map((next) =>
      Array.isArray(next.content)
        ? { ...next, content: mapNodes(next.content, visit) }
        : next,
    );
  });
}

function forEachNode(
  content: JSONContent[] | undefined,
  visit: (node: JSONContent) => void,
): void {
  for (const node of content ?? []) {
    visit(node);
    if (Array.isArray(node.content)) forEachNode(node.content, visit);
  }
}

/** Page links present in a block's content, de-duplicated by target page. */
export function collectPageLinks(
  content: JSONContent[] | undefined,
): PageLink[] {
  const byEntityId = new Map<string, PageLink>();
  forEachNode(content, (node) => {
    if (!isPageMention(node)) return;
    const entityId = node.attrs?.entityId;
    if (typeof entityId !== "string" || !entityId) return;
    if (byEntityId.has(entityId)) return;
    byEntityId.set(entityId, {
      entityId,
      label: typeof node.attrs?.label === "string" ? node.attrs.label : "",
      attrs: { ...node.attrs },
    });
  });
  return [...byEntityId.values()];
}

export interface NormalizedContent {
  content: JSONContent[];
  /** Labels of mentions dropped because their entityId matched no known page. */
  unresolved: string[];
}

/**
 * Completes the page mentions the model emits. The model only knows pageId and
 * title, so slugId, the node id and creatorId are filled here; a mention whose
 * entityId belongs to no page the user can reach degrades to plain text rather
 * than becoming a broken link in the graph.
 *
 * A mention that already carries both entityId and slugId is a link the model
 * copied from the original block. It is kept verbatim — its target may sit
 * outside the (capped) index and must survive anyway.
 */
export function normalizePageMentions(
  content: JSONContent[],
  index: SpacePageIndex,
  creatorId?: string,
): NormalizedContent {
  const unresolved: string[] = [];
  const normalized = mapNodes(content, (node) => {
    if (!isPageMention(node)) return [node];
    const entityId = node.attrs?.entityId;
    const label = typeof node.attrs?.label === "string" ? node.attrs.label : "";

    if (typeof entityId === "string" && entityId && node.attrs?.slugId) {
      return [
        { ...node, attrs: { ...node.attrs, id: node.attrs.id ?? uuid7() } },
      ];
    }

    const page = typeof entityId === "string" ? index.get(entityId) : undefined;
    if (!page) {
      unresolved.push(label);
      return label ? [{ type: "text", text: label }] : [];
    }

    return [
      {
        type: "mention",
        attrs: {
          id: node.attrs?.id ?? uuid7(),
          label: page.title,
          entityType: "page",
          entityId: page.pageId,
          slugId: page.slugId,
          ...(creatorId ? { creatorId } : {}),
        },
      },
    ];
  });
  return { content: normalized, unresolved };
}

export interface NormalizedProposal {
  operations: ProposalOperation[];
  unresolved: string[];
}

export function normalizeProposalOperations(
  operations: ProposalOperation[],
  index: SpacePageIndex,
  creatorId?: string,
): NormalizedProposal {
  const unresolved: string[] = [];
  const normalized = operations.map((operation) => {
    if (!isBlockOperation(operation) || operation.action === "delete") {
      return operation;
    }
    const result = normalizePageMentions(operation.content, index, creatorId);
    unresolved.push(...result.unresolved);
    return { ...operation, content: result.content };
  });
  return { operations: normalized, unresolved };
}

export interface PageLinkChange {
  operation: ProposalOperation;
  /** Block the change lands on: blockId for replace/delete, afterBlockId for insert. */
  blockId: string;
  added: PageLink[];
  removed: PageLink[];
}

/**
 * Links a proposal would create or destroy, per operation. `blocksById` holds
 * the current top-level block JSON, keyed by block id.
 */
export function summarizePageLinkChanges(
  operations: ProposalOperation[],
  blocksById: Map<string, JSONContent>,
): PageLinkChange[] {
  const changes: PageLinkChange[] = [];
  for (const operation of operations) {
    if (!isBlockOperation(operation)) continue;
    const blockId =
      operation.action === "insert_after"
        ? operation.afterBlockId
        : operation.blockId;
    const before =
      operation.action === "insert_after"
        ? []
        : collectPageLinks(blocksById.get(blockId)?.content);
    const after =
      operation.action === "delete" ? [] : collectPageLinks(operation.content);
    const beforeIds = new Set(before.map((link) => link.entityId));
    const afterIds = new Set(after.map((link) => link.entityId));
    const added = after.filter((link) => !beforeIds.has(link.entityId));
    const removed = before.filter((link) => !afterIds.has(link.entityId));
    if (added.length || removed.length) {
      changes.push({ operation, blockId, added, removed });
    }
  }
  return changes;
}

/** Drops every mention pointing at `entityId`, keeping surrounding text. */
export function removePageLink(
  content: JSONContent[],
  entityId: string,
): JSONContent[] {
  return mapNodes(content, (node) =>
    isPageMention(node) && node.attrs?.entityId === entityId ? [] : [node],
  );
}

function appendInline(
  content: JSONContent[],
  nodes: JSONContent[],
): JSONContent[] {
  for (let index = content.length - 1; index >= 0; index -= 1) {
    const node = content[index];
    if (node.type === "text" || node.type === "mention") {
      return [...content, ...nodes];
    }
    if (Array.isArray(node.content)) {
      const next = [...content];
      next[index] = { ...node, content: appendInline(node.content, nodes) };
      return next;
    }
  }
  return [...content, ...nodes];
}

/**
 * Puts a dropped link back at the end of the block's last text run, so a link
 * the model removed on its own can be restored without rejecting the rewrite.
 */
export function restorePageLink(
  content: JSONContent[],
  link: PageLink,
): JSONContent[] {
  return appendInline(content, [
    { type: "text", text: " " },
    { type: "mention", attrs: { ...link.attrs, id: uuid7() } },
  ]);
}

export interface LinkDecision {
  operation: ProposalOperation;
  link: PageLink;
  kind: "added" | "removed";
  /** For "added": keep the new link. For "removed": put the old link back. */
  keep: boolean;
}

/**
 * Rewrites a proposal to honour the user's choices in the link review. Keeping
 * a link the model removed by deleting its whole block means cancelling that
 * delete — the link cannot outlive the block that holds it.
 */
export function applyLinkDecisions(
  operations: ProposalOperation[],
  decisions: LinkDecision[],
): ProposalOperation[] {
  const result: ProposalOperation[] = [];
  for (const operation of operations) {
    const own = decisions.filter(
      (decision) => decision.operation === operation,
    );
    if (!own.length || !isBlockOperation(operation)) {
      result.push(operation);
      continue;
    }
    if (
      operation.action === "delete" &&
      own.some((decision) => decision.kind === "removed" && decision.keep)
    ) {
      continue;
    }
    if (operation.action === "delete") {
      result.push(operation);
      continue;
    }
    let content = operation.content;
    for (const decision of own) {
      if (decision.kind === "added" && !decision.keep) {
        content = removePageLink(content, decision.link.entityId);
      }
      if (decision.kind === "removed" && decision.keep) {
        content = restorePageLink(content, decision.link);
      }
    }
    result.push({ ...operation, content });
  }
  return result;
}
