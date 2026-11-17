import { describe, expect, it, vi } from "vitest";

vi.mock("@/main.tsx", () => ({ queryClient: {} }));

describe("editor placeholder", () => {
  it("does not abort a collaborative update when a transient position is stale", async () => {
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: {
        getItem: () => null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    });
    const { mainExtensions } = await import("./extensions");
    const extension = mainExtensions.find(
      (candidate) => candidate.name === "placeholder",
    );
    const placeholder = extension?.options.placeholder as (context: {
      editor: unknown;
      node: unknown;
      pos: number;
    }) => string;
    const editor = {
      state: {
        doc: {
          content: { size: 10 },
          resolve: vi.fn(() => {
            throw new RangeError("Position 74 out of range");
          }),
        },
      },
    };

    expect(() =>
      placeholder({
        editor,
        node: { type: { name: "paragraph" } },
        pos: 74,
      }),
    ).not.toThrow();
  }, 15_000);
});
