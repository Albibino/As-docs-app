import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Mention, UniqueID } from "@tcc-docs/editor-ext";
import { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { hashBlock } from "./assisted-writing";
import { buildProposalTransaction } from "./proposal";
import { buildSpacePageIndex, normalizePageMentions } from "./page-links";

const schema = getSchema([
  StarterKit,
  Mention,
  UniqueID.configure({ types: ["paragraph", "heading", "codeBlock"] }),
]);
const p = (id: string, text: string) => ({
  type: "paragraph",
  attrs: { id },
  content: [{ type: "text", text }],
});
const code = (id: string, text: string) => ({
  type: "codeBlock",
  attrs: { id },
  content: text ? [{ type: "text", text }] : [],
});
const stateFor = (content: any[]) =>
  EditorState.create({
    schema,
    doc: Node.fromJSON(schema, { type: "doc", content }),
  });

describe("proposal application", () => {
  it("applies safe operations in one transaction and leaves outside edits", async () => {
    const original = p("p1", "old");
    const state = stateFor([original, p("outside", "collaborative edit")]);
    const result = await buildProposalTransaction(state, [
      {
        action: "replace",
        blockId: "p1",
        baseHash: await hashBlock(original),
        content: [{ type: "text", text: "new" }],
      },
    ]);
    expect(result.transaction).not.toBeNull();
    expect(result.applied).toHaveLength(1);
    expect(result.transaction!.doc.textContent).toBe("newcollaborative edit");
  });

  it("applies a rewrite that carries a page link", async () => {
    // The model emits pageId + label only; the normalized mention must survive
    // Fragment.fromJSON against the real editor schema.
    const original = p("p1", "old");
    const state = stateFor([original]);
    const { content } = normalizePageMentions(
      [
        { type: "text", text: "Ver " },
        { type: "mention", attrs: { entityType: "page", entityId: "page-2" } },
      ],
      buildSpacePageIndex([
        { pageId: "page-2", slugId: "slug-2", title: "Arquitetura" },
      ]),
    );

    const result = await buildProposalTransaction(state, [
      {
        action: "replace",
        blockId: "p1",
        baseHash: await hashBlock(original),
        content,
      },
    ]);

    expect(result.conflicts).toEqual([]);
    const mention = result.transaction!.doc.firstChild!.child(1);
    expect(mention.type.name).toBe("mention");
    expect(mention.attrs).toMatchObject({
      entityType: "page",
      entityId: "page-2",
      slugId: "slug-2",
      label: "Arquitetura",
    });
  });

  it("isolates changed and deleted block conflicts while applying others", async () => {
    const initialA = p("a", "base a");
    const initialB = p("b", "base b");
    const state = stateFor([p("a", "changed remotely"), initialB]);
    const result = await buildProposalTransaction(state, [
      {
        action: "replace",
        blockId: "a",
        baseHash: await hashBlock(initialA),
        content: [{ type: "text", text: "ai a" }],
      },
      {
        action: "replace",
        blockId: "b",
        baseHash: await hashBlock(initialB),
        content: [{ type: "text", text: "ai b" }],
      },
      { action: "delete", blockId: "missing", baseHash: "0".repeat(64) },
    ]);
    expect(result.applied).toHaveLength(1);
    expect(result.conflicts.map((item) => item.reason)).toEqual([
      "hash_changed",
      "block_missing",
    ]);
    expect(result.transaction!.doc.textContent).toBe("changed remotelyai b");
  });

  it("accepts insertion when anchor exists despite a new following block", async () => {
    const state = stateFor([p("anchor", "A"), p("new", "new remote block")]);
    const result = await buildProposalTransaction(state, [
      {
        action: "insert_after",
        afterBlockId: "anchor",
        blockType: "paragraph",
        content: [{ type: "text", text: "AI" }],
      },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.transaction!.doc.textContent).toBe("AAInew remote block");
  });

  it("allows inserting after an opaque block without flagging it as a conflict", async () => {
    const state = stateFor([p("before", "before"), code("snippet", "x")]);
    const result = await buildProposalTransaction(state, [
      {
        action: "insert_after",
        afterBlockId: "snippet",
        blockType: "paragraph",
        content: [{ type: "text", text: "after code" }],
      },
    ]);
    expect(result.conflicts).toEqual([]);
    expect(result.applied).toHaveLength(1);
    expect(result.transaction!.doc.textContent).toBe("beforexafter code");
  });

  it("still rejects replace/delete targeting an opaque block", async () => {
    const state = stateFor([code("snippet", "x")]);
    const result = await buildProposalTransaction(state, [
      {
        action: "replace",
        blockId: "snippet",
        baseHash: await hashBlock(code("snippet", "x")),
        content: [{ type: "text", text: "y" }],
      },
    ]);
    expect(result.conflicts.map((item) => item.reason)).toEqual([
      "opaque_block",
    ]);
  });

  it("refusal needs no transaction", async () => {
    const result = await buildProposalTransaction(stateFor([p("p", "x")]), []);
    expect(result.transaction).toBeNull();
  });
});
