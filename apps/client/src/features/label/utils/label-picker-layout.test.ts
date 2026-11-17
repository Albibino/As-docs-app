import { describe, expect, it } from "vitest";
import {
  LABEL_PICKER_MAX_WIDTH,
  LABEL_PICKER_MIN_WIDTH,
  calculateLabelPickerWidth,
} from "./label-picker-layout.ts";

const measureText = (text: string) => text.length * 7;

describe("label picker layout", () => {
  it("mantém a largura mínima para conteúdos curtos", () => {
    expect(
      calculateLabelPickerWidth({
        options: [{ path: "Módulo / ERP", depth: 1 }],
        sectionTitles: [{ title: "Módulo", hint: "one active path" }],
        auxiliaryTexts: ["Search or create…"],
        measureText,
      }),
    ).toBe(LABEL_PICKER_MIN_WIDTH);
  });

  it("acompanha conteúdos médios sem atingir o limite máximo", () => {
    const width = calculateLabelPickerWidth({
      options: [{ path: "Caminho hierárquico intermediário", depth: 1 }],
      sectionTitles: [{ title: "Módulo", hint: "one active path" }],
      auxiliaryTexts: ["Search or create…"],
      measureText,
    });

    expect(width).toBeGreaterThan(LABEL_PICKER_MIN_WIDTH);
    expect(width).toBeLessThan(LABEL_PICKER_MAX_WIDTH);
  });

  it("limita caminhos longos à largura máxima", () => {
    expect(
      calculateLabelPickerWidth({
        options: [
          {
            path: "Módulos Senior / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes",
            depth: 6,
          },
        ],
        sectionTitles: [{ title: "Módulos Senior", hint: "one active path" }],
        auxiliaryTexts: ["Search or create…"],
        measureText,
      }),
    ).toBe(LABEL_PICKER_MAX_WIDTH);
  });

  it("considera o recuo e todos os textos auxiliares", () => {
    const shallow = calculateLabelPickerWidth({
      options: [{ path: "ERP / Subitem / Caminho", depth: 1 }],
      sectionTitles: [{ title: "Módulo", hint: "one active path" }],
      auxiliaryTexts: ["Search or create…"],
      measureText,
    });
    const deep = calculateLabelPickerWidth({
      options: [{ path: "ERP / Subitem / Caminho", depth: 5 }],
      sectionTitles: [{ title: "Módulo", hint: "one active path" }],
      auxiliaryTexts: ["Search or create…"],
      measureText,
    });
    const longAuxiliary = calculateLabelPickerWidth({
      options: [{ path: "ERP / Subitem / Caminho", depth: 1 }],
      sectionTitles: [{ title: "Módulo", hint: "one active path" }],
      auxiliaryTexts: ['Create "Uma label com nome muito comprido"'],
      measureText,
    });

    expect(deep).toBeGreaterThan(shallow);
    expect(longAuxiliary).toBeGreaterThan(LABEL_PICKER_MIN_WIDTH);
  });
});
