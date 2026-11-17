import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tcc-docs/editor-ext";
import { Node } from "@tiptap/pm/model";
import { EditorState } from "@tiptap/pm/state";
import { describe, expect, it } from "vitest";
import { buildSafeRevert } from "./safe-revert";

const schema = getSchema([
  StarterKit,
  UniqueID.configure({ types: ["paragraph", "heading"] }),
]);
const p = (id: string, text: string) => ({
  type: "paragraph",
  attrs: { id },
  content: [{ type: "text", text }],
});
const doc = (...content: any[]) => ({ type: "doc", content });
const stateFor = (value: any) =>
  EditorState.create({ schema, doc: Node.fromJSON(schema, value) });
const texts = (state: EditorState, tr: any) =>
  tr.doc.content.content.map((n: any) => n.textContent);

describe("buildSafeRevert", () => {
  it("restores the AI's rewrite, removes its insertion and brings back its deletion", async () => {
    const snapshot = doc(p("a", "old a"), p("b", "old b"), p("c", "old c"));
    const accepted = doc(p("a", "new a"), p("n", "inserted"), p("c", "old c"));
    const tr = await buildSafeRevert(stateFor(accepted), snapshot, accepted);
    expect(tr).not.toBeNull();
    expect(texts(stateFor(accepted), tr)).toEqual(["old a", "old b", "old c"]);
  });

  it("leaves blocks edited after the application alone", async () => {
    const snapshot = doc(p("a", "old a"), p("b", "old b"));
    const accepted = doc(p("a", "new a"), p("b", "new b"));
    const now = doc(p("a", "new a"), p("b", "edited later"));
    const state = stateFor(now);
    const tr = await buildSafeRevert(state, snapshot, accepted, new Set(["b"]));
    expect(texts(state, tr)).toEqual(["old a", "edited later"]);
  });

  it("does not overwrite a block that no longer matches what the AI left", async () => {
    const snapshot = doc(p("a", "old a"));
    const accepted = doc(p("a", "new a"));
    const state = stateFor(doc(p("a", "someone else")));
    expect(await buildSafeRevert(state, snapshot, accepted)).toBeNull();
  });
});
