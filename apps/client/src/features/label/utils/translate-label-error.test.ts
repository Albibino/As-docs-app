import { translateLabelApiError } from "./translate-label-error";

const translate = (key: string) =>
  ({
    "A label tree with this name already exists": "Já existe uma árvore com este nome",
    "Failed to create label tree": "Falha ao criar árvore de labels",
  })[key] ?? key;

describe("translateLabelApiError", () => {
  it("translates a known backend message", () => {
    const i18n = {
      exists: (key: string) => key === "A label tree with this name already exists",
    };

    expect(
      translateLabelApiError(
        { response: { data: { message: "A label tree with this name already exists" } } },
        translate,
        i18n,
        "Failed to create label tree",
      ),
    ).toBe("Já existe uma árvore com este nome");
  });

  it("uses the translated operation fallback for an unknown backend message", () => {
    const i18n = { exists: () => false };
    const unknownMessage = "Internal database constraint details";

    expect(
      translateLabelApiError(
        { response: { data: { message: unknownMessage } } },
        translate,
        i18n,
        "Failed to create label tree",
      ),
    ).toBe("Falha ao criar árvore de labels");
    expect(
      translateLabelApiError(
        { response: { data: { message: [unknownMessage] } } },
        translate,
        i18n,
        "Failed to create label tree",
      ),
    ).toBe("Falha ao criar árvore de labels");
  });
});
