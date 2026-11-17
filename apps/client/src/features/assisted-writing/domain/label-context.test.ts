import { describe, expect, it } from "vitest";
import {
  findFreePageLabelByName,
  getAvailableLabelNames,
  getPageLabelNames,
} from "./label-context";

describe("label context for assisted writing", () => {
  const taxonomy = {
    paths: [
      {
        tree: { id: "tree-1", name: "Status" },
        selectedNodeId: "node-2",
        nodes: [
          { id: "node-1", name: "Em andamento" },
          { id: "node-2", name: "Revisão" },
        ],
      },
      {
        tree: { id: "tree-2", name: "Prioridade" },
        selectedNodeId: null,
        nodes: [],
      },
    ],
    freeLabels: [{ id: "free-1", name: "RFC" }],
  } as any;

  it("flattens selected taxonomy nodes and free labels", () => {
    expect(getPageLabelNames(taxonomy)).toEqual([
      "Revisão",
      "Prioridade",
      "RFC",
    ]);
  });

  it("flattens available taxonomy nodes and free labels", () => {
    const available = {
      trees: [
        {
          name: "Status",
          nodes: [{ name: "Em andamento" }, { name: "Revisão" }],
        },
      ],
      freeLabels: [{ name: "RFC" }],
    } as any;

    expect(getAvailableLabelNames(available)).toEqual([
      "Em andamento",
      "Revisão",
      "RFC",
    ]);
  });

  it("only resolves free labels for the legacy remove operation", () => {
    expect(findFreePageLabelByName(taxonomy, "rfc")?.id).toBe("free-1");
    expect(findFreePageLabelByName(taxonomy, "revisão")).toBeUndefined();
  });
});
