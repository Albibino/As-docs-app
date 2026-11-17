import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageEditorAtom,
  titleEditorAtom,
} from "@/features/editor/atoms/editor-atoms";
import { usePageQuery } from "@/features/page/queries/page-query";
import { useCurrentPageDraft } from "./use-current-page-draft";

vi.mock("@/features/page/queries/page-query", () => ({
  usePageQuery: vi.fn(),
}));

const mockedUsePageQuery = vi.mocked(usePageQuery);

function createEditor(initialContent: unknown) {
  let content = initialContent;
  const listeners = new Map<string, Set<() => void>>();

  return {
    isDestroyed: false,
    getJSON: () => content,
    on: (event: string, listener: () => void) => {
      listeners.set(event, (listeners.get(event) ?? new Set()).add(listener));
    },
    off: (event: string, listener: () => void) => {
      listeners.get(event)?.delete(listener);
    },
    update(nextContent: unknown) {
      content = nextContent;
      listeners.get("transaction")?.forEach((listener) => listener());
    },
  };
}

describe("useCurrentPageDraft", () => {
  beforeEach(() => {
    mockedUsePageQuery.mockReturnValue({
      data: {
        title: "Saved title",
        content: JSON.stringify({ type: "doc", content: [] }),
        updatedAt: "2026-09-11T12:00:00.000Z",
        permissions: { canEdit: true },
      },
    } as any);
  });

  it("reflects a Tiptap edit made after the draft hook mounts", () => {
    const editor = createEditor({ type: "doc", content: [] });
    const store = createStore();
    store.set(pageEditorAtom as any, editor as any);
    store.set(titleEditorAtom as any, null);
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useCurrentPageDraft("page-1"), {
      wrapper,
    });

    act(() => {
      editor.update({
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Live" }] },
        ],
      });
    });

    expect(result.current.draft.content).toEqual({
      type: "doc",
      content: [
        { type: "paragraph", content: [{ type: "text", text: "Live" }] },
      ],
    });
  });
});
