import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tcc-docs/editor-ext";
import { describe, expect, it } from "vitest";
import { ensureTopLevelBlockIds } from "./ensure-block-ids";

const extensions = [
  StarterKit,
  UniqueID.configure({
    types: ["paragraph", "heading", "blockquote", "horizontalRule"],
  }),
];

describe("stable top-level IDs", () => {
  it("repairs old and duplicate blocks without visible changes", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "old" }] },
          {
            type: "paragraph",
            attrs: { id: "same" },
            content: [{ type: "text", text: "copy" }],
          },
          {
            type: "paragraph",
            attrs: { id: "same" },
            content: [{ type: "text", text: "paste" }],
          },
          {
            type: "blockquote",
            content: [
              {
                type: "paragraph",
                content: [{ type: "text", text: "opaque" }],
              },
            ],
          },
        ],
      },
    });
    const before = editor.state.doc.textContent;
    expect(ensureTopLevelBlockIds(editor)).toBe(true);
    const ids = editor.getJSON().content!.map((node) => node.attrs?.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.every(Boolean)).toBe(true);
    expect(editor.state.doc.textContent).toBe(before);
    expect(ensureTopLevelBlockIds(editor)).toBe(false);
  });

  it("repairs a horizontal rule saved before ids existed", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "p1" },
            content: [{ type: "text", text: "before" }],
          },
          { type: "horizontalRule" },
          {
            type: "paragraph",
            attrs: { id: "p2" },
            content: [{ type: "text", text: "after" }],
          },
        ],
      },
    });
    expect(ensureTopLevelBlockIds(editor)).toBe(true);
    const nodes = editor.getJSON().content!;
    expect(nodes[1].type).toBe("horizontalRule");
    expect(nodes[1].attrs?.id).toBeTruthy();
  });

  it("Enter creates distinct IDs", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "p1" },
            content: [{ type: "text", text: "abc" }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(2);
    editor.commands.splitBlock();
    const ids = editor.getJSON().content!.map((node) => node.attrs?.id);
    expect(ids).toHaveLength(2);
    expect(ids[0]).not.toBe(ids[1]);
  });

  it("reassigns ID when copied block is pasted into same page", () => {
    const editor = new Editor({
      extensions,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: "p1" },
            content: [{ type: "text", text: "copy" }],
          },
        ],
      },
    });
    editor.commands.setTextSelection(editor.state.doc.content.size);
    editor.commands.insertContent(editor.getJSON().content![0]);
    const ids = editor.getJSON().content!.map((node) => node.attrs?.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
