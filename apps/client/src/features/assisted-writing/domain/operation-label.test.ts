import { describe, expect, it } from "vitest";
import { assistantSummary, operationLabel } from "./operation-label";

const blocks: Record<string, { type: string; text: string }> = {
  p1: {
    type: "paragraph",
    text: "No primeiro dia, o colaborador recebe o notebook e faz o cadastro.",
  },
  h1: { type: "heading", text: "Primeiro dia" },
};
const lookup = (id: string) => blocks[id];

describe("operationLabel", () => {
  it("never shows internal block ids", () => {
    const label = operationLabel(
      { action: "replace", blockId: "p1", baseHash: "x", content: [] },
      lookup,
    );
    expect(label).toBe("Alterar parágrafo");
    expect(label).not.toContain("p1");
  });

  it("names the inserted block type in Portuguese and cites the anchor", () => {
    expect(
      operationLabel(
        {
          action: "insert_after",
          afterBlockId: "p1",
          blockType: "orderedList",
          content: [],
        },
        lookup,
      ),
    ).toBe('Inserir lista numerada após "No primeiro dia, o colaborador recebe o…"');
  });

  it("falls back to a generic name when the block is unknown", () => {
    expect(
      operationLabel({ action: "delete", blockId: "gone", baseHash: "x" }, lookup),
    ).toBe("Remover bloco");
    expect(
      operationLabel({
        action: "insert_after",
        afterBlockId: "gone",
        blockType: "table",
        content: [],
      }),
    ).toBe("Inserir tabela");
  });

  it("describes page operations", () => {
    expect(operationLabel({ action: "set_title", title: "Onboarding" })).toBe(
      'Renomear página para "Onboarding"',
    );
    expect(operationLabel({ action: "add_label", label: "rh" })).toBe(
      'Adicionar label "rh"',
    );
    expect(
      operationLabel({ action: "replace", blockId: "h1", baseHash: "x", content: [] }, lookup),
    ).toBe("Alterar título");
  });
});

describe("assistantSummary", () => {
  it("summarizes proposals and the no-change answer", () => {
    expect(assistantSummary('[{"action":"set_title","title":"x"}]')).toBe(
      "1 alteração proposta.",
    );
    expect(assistantSummary("[{},{}]")).toBe("2 alterações propostas.");
    expect(assistantSummary("[]")).toBe("Nenhuma alteração proposta.");
    expect(assistantSummary('{"action":"none","reason":"É uma pergunta."}')).toBe(
      "Nenhuma alteração proposta: É uma pergunta.",
    );
    expect(assistantSummary("texto livre")).toBe("Proposta recebida.");
  });
});
