import { describe, expect, it } from "vitest";
import type { JSONContent } from "@tiptap/core";
import {
  applyLinkDecisions,
  buildSpacePageIndex,
  collectPageLinks,
  normalizePageMentions,
  normalizeProposalOperations,
  removePageLink,
  restorePageLink,
  summarizePageLinkChanges,
} from "./page-links";
import type { ProposalOperation } from "./assisted-writing";

const arquitetura = {
  pageId: "page-2",
  slugId: "slug-2",
  title: "Arquitetura",
};
const index = buildSpacePageIndex([arquitetura]);

function mention(attrs: Record<string, unknown>): JSONContent {
  return { type: "mention", attrs };
}

describe("normalizePageMentions", () => {
  it("completes a mention the model emitted with only pageId and label", () => {
    const { content, unresolved } = normalizePageMentions(
      [
        { type: "text", text: "Ver " },
        mention({ entityType: "page", entityId: "page-2", label: "qualquer" }),
      ],
      index,
      "user-1",
    );

    expect(unresolved).toEqual([]);
    expect(content[1].attrs).toMatchObject({
      entityType: "page",
      entityId: "page-2",
      slugId: "slug-2",
      label: "Arquitetura",
      creatorId: "user-1",
    });
    expect(content[1].attrs?.id).toEqual(expect.any(String));
  });

  it("degrades an invented pageId to plain text", () => {
    const { content, unresolved } = normalizePageMentions(
      [mention({ entityType: "page", entityId: "made-up", label: "Fantasma" })],
      index,
    );

    expect(unresolved).toEqual(["Fantasma"]);
    expect(content).toEqual([{ type: "text", text: "Fantasma" }]);
  });

  it("keeps a copied mention whose target is outside the index", () => {
    // The index is capped and space-scoped; a link the model copied verbatim
    // must survive even when its target is not listed.
    const copied = mention({
      id: "existing",
      entityType: "page",
      entityId: "page-99",
      slugId: "slug-99",
      label: "Outra",
    });

    const { content, unresolved } = normalizePageMentions([copied], index);

    expect(unresolved).toEqual([]);
    expect(content).toEqual([copied]);
  });

  it("leaves user mentions untouched", () => {
    const user = mention({
      id: "u",
      entityType: "user",
      entityId: "user-9",
      label: "Ana",
    });

    expect(normalizePageMentions([user], index).content).toEqual([user]);
  });

  it("normalizes mentions nested inside lists", () => {
    const { content } = normalizePageMentions(
      [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [
                mention({ entityType: "page", entityId: "page-2", label: "x" }),
              ],
            },
          ],
        },
      ],
      index,
    );

    expect(content[0].content?.[0].content?.[0].attrs).toMatchObject({
      slugId: "slug-2",
    });
  });
});

describe("normalizeProposalOperations", () => {
  it("normalizes replace and insert content and ignores delete", () => {
    const operations: ProposalOperation[] = [
      {
        action: "replace",
        blockId: "b1",
        baseHash: "h1",
        content: [
          mention({ entityType: "page", entityId: "page-2", label: "x" }),
        ],
      },
      { action: "delete", blockId: "b2", baseHash: "h2" },
      { action: "set_title", title: "Novo" },
    ];

    const result = normalizeProposalOperations(operations, index);

    expect((result.operations[0] as any).content[0].attrs.slugId).toBe(
      "slug-2",
    );
    expect(result.operations[1]).toBe(operations[1]);
    expect(result.operations[2]).toBe(operations[2]);
  });
});

const linked = mention({
  entityType: "page",
  entityId: "page-2",
  slugId: "slug-2",
  label: "Arquitetura",
});
const blocksById = new Map<string, JSONContent>([
  ["b1", { type: "paragraph", content: [linked] }],
]);

describe("summarizePageLinkChanges", () => {
  it("reports a link the rewrite silently dropped", () => {
    const operation: ProposalOperation = {
      action: "replace",
      blockId: "b1",
      baseHash: "h1",
      content: [{ type: "text", text: "sem link" }],
    };

    const [change] = summarizePageLinkChanges([operation], blocksById);
    expect(change.operation).toBe(operation);
    expect(change.blockId).toBe("b1");
    expect(change.added).toEqual([]);
    expect(change.removed).toEqual([
      { entityId: "page-2", label: "Arquitetura", attrs: linked.attrs },
    ]);
  });

  it("reports a deleted block's links as removed", () => {
    const operation: ProposalOperation = {
      action: "delete",
      blockId: "b1",
      baseHash: "h1",
    };

    expect(
      summarizePageLinkChanges([operation], blocksById)[0].removed,
    ).toMatchObject([{ entityId: "page-2" }]);
  });

  it("reports a new link on insert_after", () => {
    const operation: ProposalOperation = {
      action: "insert_after",
      afterBlockId: "b1",
      blockType: "paragraph",
      content: [linked],
    };

    expect(
      summarizePageLinkChanges([operation], blocksById)[0].added,
    ).toMatchObject([{ entityId: "page-2", label: "Arquitetura" }]);
  });

  it("stays silent when the links are unchanged", () => {
    const operation: ProposalOperation = {
      action: "replace",
      blockId: "b1",
      baseHash: "h1",
      content: [{ type: "text", text: "novo texto " }, linked],
    };

    expect(summarizePageLinkChanges([operation], blocksById)).toEqual([]);
  });
});

describe("applyLinkDecisions", () => {
  it("restores a link the model dropped from a rewritten block", () => {
    const operation: ProposalOperation = {
      action: "replace",
      blockId: "b1",
      baseHash: "h1",
      content: [{ type: "text", text: "sem link" }],
    };
    const [change] = summarizePageLinkChanges([operation], blocksById);

    const [result] = applyLinkDecisions(
      [operation],
      [
        {
          operation,
          link: change.removed[0],
          kind: "removed",
          keep: true,
        },
      ],
    );

    expect(collectPageLinks((result as any).content)).toMatchObject([
      { entityId: "page-2" },
    ]);
  });

  it("strips a new link the user rejected", () => {
    const operation: ProposalOperation = {
      action: "insert_after",
      afterBlockId: "b1",
      blockType: "paragraph",
      content: [{ type: "text", text: "Ver " }, linked],
    };
    const [change] = summarizePageLinkChanges([operation], blocksById);

    const [result] = applyLinkDecisions(
      [operation],
      [{ operation, link: change.added[0], kind: "added", keep: false }],
    );

    expect((result as any).content).toEqual([{ type: "text", text: "Ver " }]);
  });

  it("cancels a delete when its link must survive", () => {
    const operation: ProposalOperation = {
      action: "delete",
      blockId: "b1",
      baseHash: "h1",
    };
    const [change] = summarizePageLinkChanges([operation], blocksById);

    expect(
      applyLinkDecisions(
        [operation],
        [{ operation, link: change.removed[0], kind: "removed", keep: true }],
      ),
    ).toEqual([]);
  });

  it("keeps operations without decisions untouched", () => {
    const operation: ProposalOperation = { action: "set_title", title: "Novo" };

    expect(applyLinkDecisions([operation], [])).toEqual([operation]);
  });
});

describe("editing links before applying", () => {
  const link = collectPageLinks([linked])[0];

  it("removes a link while keeping the surrounding text", () => {
    const content = [
      { type: "text", text: "Ver " },
      mention({ entityType: "page", entityId: "page-2", slugId: "slug-2" }),
      { type: "text", text: " depois" },
    ];

    expect(removePageLink(content, "page-2")).toEqual([
      { type: "text", text: "Ver " },
      { type: "text", text: " depois" },
    ]);
  });

  it("restores a dropped link at the end of the last text run", () => {
    const content = restorePageLink([{ type: "text", text: "Texto" }], link);

    expect(content).toHaveLength(3);
    expect(content[2].attrs).toMatchObject({
      entityId: "page-2",
      slugId: "slug-2",
      label: "Arquitetura",
    });
    expect(collectPageLinks(content)).toMatchObject([
      { entityId: "page-2", label: "Arquitetura" },
    ]);
  });

  it("restores a dropped link inside the last list item", () => {
    const content = restorePageLink(
      [
        {
          type: "listItem",
          content: [
            { type: "paragraph", content: [{ type: "text", text: "Item" }] },
          ],
        },
      ],
      link,
    );

    expect(content[0].content?.[0].content).toHaveLength(3);
  });
});
