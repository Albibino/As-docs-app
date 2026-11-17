import { describe, expect, it } from "vitest";
import {
  hashBlock,
  prepareGenerationContext,
  selectedTopLevelBlockIds,
  serializeTopLevelBlocks,
  changedBlocksSinceSnapshot,
  changedDocumentBlockIds,
} from "./assisted-writing";

const paragraph = (id: string, text: string, marks?: any[]) => ({
  type: "paragraph",
  attrs: { id },
  content: [{ type: "text", text, ...(marks ? { marks } : {}) }],
});

describe("assisted-writing block domain", () => {
  it("serializes tables as editable blocks and preserves full hash", async () => {
    const table = {
      type: "table",
      attrs: { id: "table-1", style: "wide" },
      content: [{ type: "tableRow", content: [] }],
    };
    const [block] = await serializeTopLevelBlocks({
      type: "doc",
      content: [table],
    });
    expect(block).toMatchObject({
      blockId: "table-1",
      type: "table",
      editable: true,
      content: table,
    });
    expect(block.hash).toHaveLength(64);
  });

  it("changes hash when only formatting changes", async () => {
    const plain = paragraph("p1", "same");
    const bold = paragraph("p1", "same", [{ type: "bold" }]);
    expect(await hashBlock(plain)).not.toBe(await hashBlock(bold));
  });

  it("uses whole selected block and includes crossing opaque node", () => {
    const nodes = [
      { id: "p1", pos: 0, size: 8 },
      { id: "table", pos: 8, size: 12 },
      { id: "p2", pos: 20, size: 8 },
    ];
    const document = {
      descendants(fn: (node: any, pos: number) => false | void) {
        nodes.forEach((item) =>
          fn({ attrs: { id: item.id }, nodeSize: item.size }, item.pos),
        );
      },
    };
    expect(selectedTopLevelBlockIds(document, 3, 5)).toEqual(["p1"]);
    expect(selectedTopLevelBlockIds(document, 3, 22)).toEqual([
      "p1",
      "table",
      "p2",
    ]);
  });

  it("sends the whole page regardless of size, leaving the budget to the AI service", async () => {
    const large = {
      type: "doc",
      content: Array.from({ length: 12 }, (_, index) =>
        paragraph(`p${index}`, "long content repeated many times ".repeat(20)),
      ),
    };
    const result = await prepareGenerationContext(large);
    expect(result.blocks).toHaveLength(12);
    expect(result.blocks.some((block) => block.type === "omitted")).toBe(false);
    expect(result.selectedBlockIds).toBeUndefined();
  });

  it("reports the selection without dropping the surrounding blocks", async () => {
    const document = {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: { id: "h1", level: 2 },
          content: [{ type: "text", text: "Title" }],
        },
        ...Array.from({ length: 8 }, (_, index) =>
          paragraph(`p${index}`, `paragraph ${index} ${"word ".repeat(40)}`),
        ),
      ],
    };
    const result = await prepareGenerationContext(document, ["p4"]);
    expect(result.selectedBlockIds).toEqual(["p4"]);
    expect(result.blocks).toHaveLength(9);
    expect(result.blocks.some((block) => block.blockId === "h1")).toBe(true);
  });

  it("keeps changed block order for stable-prefix second turn", () => {
    const block = (blockId: string, hash: string) => ({
      blockId,
      hash,
      type: "paragraph",
      editable: true,
    });
    const snapshot = [block("a", "1"), block("b", "2"), block("c", "3")];
    const current = [block("a", "1"), block("b", "new"), block("c", "newer")];
    expect(
      changedBlocksSinceSnapshot(snapshot, current).map((item) => item.blockId),
    ).toEqual(["b", "c"]);
  });

  it("distinguishes immediate undo from later edits", () => {
    const block = (blockId: string, hash: string) => ({
      blockId,
      hash,
      type: "paragraph",
      editable: true,
    });
    const accepted = [block("ai", "same"), block("outside", "same")];
    expect(changedDocumentBlockIds(accepted, accepted)).toEqual([]);
    expect(
      changedDocumentBlockIds(accepted, [
        block("ai", "same"),
        block("outside", "edited"),
        block("new", "hash"),
      ]),
    ).toEqual(["outside", "new"]);
  });
});
