import { getSchema } from "@tiptap/core";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/main.tsx", () => ({ queryClient: {} }));

// Nodes that belong to the `block` group — so ProseMirror accepts them as a
// direct child of `doc` — but that the editor only ever nests inside another
// node. They never reach the assisted-writing serializer as a top-level block.
const NESTED_ONLY_BLOCKS = new Set([
  "column",
  "detailsContent",
  "detailsSummary",
]);

describe("top-level block identity", () => {
  it("gives every node that can sit at the top level an id attribute", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
    const { mainExtensions } = await import("./extensions");
    const schema = getSchema(mainExtensions as any);

    const missing = Object.values(schema.nodes)
      .filter(
        (type) =>
          type.name !== "doc" &&
          !NESTED_ONLY_BLOCKS.has(type.name) &&
          Boolean(schema.nodes.doc.contentMatch.matchType(type)),
      )
      .filter((type) => !("id" in (type.spec.attrs ?? {})))
      .map((type) => type.name);

    // serializeTopLevelBlocks() throws for any top-level block without an id,
    // so the UniqueID `types` list must cover every one of them.
    expect(missing).toEqual([]);
    // Importing the full editor extension graph takes several seconds.
  }, 30000);
});
