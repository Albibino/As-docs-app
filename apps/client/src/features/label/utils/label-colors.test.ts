import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_TREE_COLOR,
  LABEL_COLOR_KEYS,
  LABEL_COLOR_PICKER_MAX_BRIGHTNESS,
  LABEL_COLOR_PICKER_MIN_BRIGHTNESS,
  getClosestLabelColorKey,
  getLabelColor,
  getLabelHierarchyColor,
  hexToHsv,
  hsvToHex,
  normalizeLabelPickerColor,
  resolveLabelTreeColor,
} from "./label-colors";

describe("cores hierárquicas de labels", () => {
  it("usa slate como cor padrão da árvore", () => {
    expect(DEFAULT_LABEL_TREE_COLOR).toBe("slate");
    expect(resolveLabelTreeColor(null)).toBe("slate");
    expect(resolveLabelTreeColor(undefined)).toBe("slate");
    expect(resolveLabelTreeColor("blue")).toBe("blue");
  });

  it("usa slate como base dos tons hierárquicos quando a árvore não tem cor", () => {
    const root = getLabelHierarchyColor("Módulo", null, 0, "light");
    const child = getLabelHierarchyColor("Módulo", null, 1, "light");
    const slateRoot = getLabelHierarchyColor("Módulo", "slate", 0, "light");

    expect(root).toEqual(slateRoot);
    expect(child.dot).not.toBe(root.dot);
  });

  it("mantém uma paleta interna de 16 cores distintas", () => {
    expect(LABEL_COLOR_KEYS).toHaveLength(16);

    for (const key of LABEL_COLOR_KEYS) {
      expect(
        getClosestLabelColorKey(
          getLabelColor("Módulos Senior", "light", key).dot,
        ),
      ).toBe(key);
    }
  });

  it("mapeia cores escolhidas para a chave de paleta mais próxima", () => {
    expect(getClosestLabelColorKey("#3a81f5")).toBe("blue");
    expect(getClosestLabelColorKey("#dc4a4a")).toBe("red");
    expect(
      getClosestLabelColorKey(
        getLabelColor("Módulos Senior", "light", "cyan").dot,
      ),
    ).toBe("cyan");
  });

  it("converte HSV para HEX e retorna HSV de volta", () => {
    const hex = hsvToHex(210, 75, 50);

    expect(hex).toMatch(/^#[0-9a-f]{6}$/i);
    expect(hexToHsv(hex)).toEqual([
      expect.closeTo(210, 0.01),
      expect.closeTo(75, 0.01),
      expect.closeTo(50, 0.01),
    ]);
  });

  it("limita preto e branco aos extremos seguros de brilho", () => {
    const black = normalizeLabelPickerColor("#000000");
    const white = normalizeLabelPickerColor("#ffffff");
    const blackBrightness = hexToHsv(black)?.[2];
    const whiteBrightness = hexToHsv(white)?.[2];

    expect(black).not.toBe("#000000");
    expect(white).not.toBe("#ffffff");
    expect(blackBrightness).toBeCloseTo(LABEL_COLOR_PICKER_MIN_BRIGHTNESS, 1);
    expect(whiteBrightness).toBeCloseTo(LABEL_COLOR_PICKER_MAX_BRIGHTNESS, 1);
  });

  it("mantém tons próximos dos extremos dentro da faixa permitida", () => {
    const nearBlack = hexToHsv(normalizeLabelPickerColor("#030303"))?.[2];
    const nearWhite = hexToHsv(normalizeLabelPickerColor("#fefefe"))?.[2];

    expect(nearBlack).toBeGreaterThanOrEqual(LABEL_COLOR_PICKER_MIN_BRIGHTNESS);
    expect(nearWhite).toBeLessThanOrEqual(LABEL_COLOR_PICKER_MAX_BRIGHTNESS);
  });

  it("usa o tom saturado da cor escolhida pela árvore no nível raiz", () => {
    const root = getLabelHierarchyColor("Módulos Senior", "blue", 0, "light");
    const base = getLabelColor("Módulos Senior", "light", "blue");

    expect(root.bg).toBe(base.dot);
    expect(root.bg).not.toBe("#ffffff");
    expect(root.fg).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("mantém a fonte forte no mesmo matiz da cor da árvore", () => {
    for (const scheme of ["light", "dark"] as const) {
      const base = getLabelColor("Módulos Senior", scheme, "purple");
      const deep = getLabelHierarchyColor(
        "Módulos Senior",
        "purple",
        3,
        scheme,
      );

      expect(deep.fg).toBe(base.fg);
      expect(deep.fg).not.toBe("#1f2937");
      expect(deep.fg).not.toBe("#ffffff");
    }
  });

  it("clareia quatro níveis com diferenças visíveis sem remover a cor", () => {
    const tones = [0, 1, 2, 3].map((depth) =>
      getLabelHierarchyColor("Módulos Senior", "blue", depth, "light"),
    );
    const brightness = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/.{2}/g)!
        .map((value) => Number.parseInt(value, 16));
      return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
    };

    expect(new Set(tones.map((color) => color.bg)).size).toBe(4);
    expect(brightness(tones[1].bg) - brightness(tones[0].bg)).toBeGreaterThan(
      20,
    );
    expect(brightness(tones[2].bg) - brightness(tones[1].bg)).toBeGreaterThan(
      20,
    );
    expect(brightness(tones[3].bg) - brightness(tones[2].bg)).toBeGreaterThan(
      20,
    );
    for (const color of tones) {
      expect(color.bg).not.toBe("#ffffff");
      expect(color.bg).not.toContain("rgba");
      expect(color.dot).not.toBe("#ffffff");
      expect(color.dot).not.toContain("rgba");
    }
  });

  it("mantém o fallback da árvore sem cor definida nos dois temas", () => {
    const light = getLabelHierarchyColor("Módulos Senior", null, 2, "light");
    const dark = getLabelHierarchyColor("Módulos Senior", null, 2, "dark");

    expect(light.bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.bg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(light.fg).toMatch(/^#[0-9a-f]{6}$/i);
    expect(dark.fg).toMatch(/^#[0-9a-f]{6}$/i);
  });
});
