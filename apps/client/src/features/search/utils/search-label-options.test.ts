import type {
  IAvailableTaxonomyTree,
  ILabelNode,
} from "@/features/label/types/label.types.ts";
import { describe, expect, it } from "vitest";
import { flattenSearchLabelTree } from "./search-label-options.ts";

const node = (input: Partial<ILabelNode> & Pick<ILabelNode, "id" | "name">) =>
  ({
    parentId: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    position: 0,
    ...input,
  }) as ILabelNode;

const tree = (nodes: ILabelNode[]) =>
  ({ id: "tree-1", name: "Módulos", nodes }) as IAvailableTaxonomyTree;

describe("flattenSearchLabelTree", () => {
  it("ordena por cadastro e mantém a pré-ordem independentemente de position", () => {
    const options = flattenSearchLabelTree(
      tree([
        node({
          id: "root-late",
          name: "Raiz tardia",
          createdAt: "2026-01-03T00:00:00.000Z",
          position: 0,
        }),
        node({
          id: "child-late",
          name: "Filho tardio",
          parentId: "root-early",
          createdAt: "2026-01-04T00:00:00.000Z",
          position: 0,
        }),
        node({
          id: "root-early",
          name: "Raiz antiga",
          createdAt: "2026-01-01T00:00:00.000Z",
          position: 99,
        }),
        node({
          id: "child-early",
          name: "Filho antigo",
          parentId: "root-early",
          createdAt: "2026-01-02T00:00:00.000Z",
          position: 99,
        }),
      ]),
    );

    expect(options.map((option) => option.displayName)).toEqual([
      "Raiz antiga",
      "Raiz antiga / Filho antigo",
      "Raiz antiga / Filho tardio",
      "Raiz tardia",
    ]);
  });

  it("usa position, nome e id como desempates e trata órfãos como raízes", () => {
    const options = flattenSearchLabelTree(
      tree([
        node({
          id: "same-b",
          name: "Mesmo",
          createdAt: "2026-01-01T00:00:00.000Z",
          position: 2,
        }),
        node({
          id: "same-a",
          name: "Mesmo",
          createdAt: "2026-01-01T00:00:00.000Z",
          position: 2,
        }),
        node({
          id: "name-z",
          name: "Zeta",
          createdAt: "2026-01-01T00:00:00.000Z",
          position: 2,
        }),
        node({
          id: "name-a",
          name: "Alfa",
          createdAt: "2026-01-01T00:00:00.000Z",
          position: 2,
        }),
        node({
          id: "orphan",
          name: "Órfão",
          parentId: "missing-parent",
          createdAt: "2025-12-31T00:00:00.000Z",
        }),
      ]),
    );

    expect(options.map((option) => option.displayName)).toEqual([
      "Órfão",
      "Alfa",
      "Mesmo",
      "Mesmo",
      "Zeta",
    ]);
    expect(options[2].id).toBe("same-a");
    expect(options[3].id).toBe("same-b");
  });
});
