import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LabelColorPicker } from "./label-color-picker";
import type { LabelColorKey } from "@/features/label/types/label.types.ts";
import {
  getLabelColor,
  hexToHsv,
  normalizeLabelPickerColor,
} from "@/features/label/utils/label-colors.ts";

vi.mock("@mantine/core", () => {
  const Text = ({ component: Component = "span", children, ...props }: any) => (
    <Component data-mantine-text="true" {...props}>
      {children}
    </Component>
  );
  const HueSlider = ({
    value,
    onChange,
    "aria-label": ariaLabel,
    ...props
  }: any) => (
    <div
      role="slider"
      aria-label={ariaLabel}
      data-testid="mantine-hue-slider"
      data-value={value}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowRight") onChange?.(120);
      }}
      onClick={() => onChange?.(0)}
      {...props}
    />
  );
  const ColorSwatch = ({ ...props }: any) => <span {...props} />;
  const VisuallyHidden = ({ children, ...props }: any) => (
    <span data-testid="visually-hidden" {...props}>
      {children}
    </span>
  );
  const Group = ({ children, ...props }: any) => (
    <div {...props}>{children}</div>
  );
  return {
    ColorSwatch,
    Group,
    HueSlider,
    Text,
    VisuallyHidden,
    useComputedColorScheme: () => "light",
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const treeName = "Módulos Senior";

describe("LabelColorPicker", () => {
  it("renderiza somente a barra de matiz e mantém a descrição de acessibilidade oculta", () => {
    const onChange = vi.fn();

    render(
      <LabelColorPicker
        value={null}
        onChange={onChange}
        previewName={treeName}
      />,
    );

    const picker = screen.getByTestId("mantine-hue-slider");
    expect(screen.getByLabelText("Hue")).toBeTruthy();
    expect(screen.queryByLabelText("Saturation")).toBeNull();
    expect(screen.getByRole("img", { name: "Selected color" })).toBeTruthy();
    expect(picker.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByTestId("visually-hidden").textContent).toContain(
      "Color brightness is limited between {{min}}% and {{max}}%.",
    );
    expect(
      Array.from(document.querySelectorAll("[data-mantine-text='true']")).some(
        (element) =>
          element.textContent ===
          "Choose a color. It will be matched to the closest supported color.",
      ),
    ).toBe(false);
    expect(screen.queryByText("Saturation")).toBeNull();
    expect(screen.queryByText("Choose a color.")).toBeNull();
    expect(screen.queryByRole("button", { name: /automatic/i })).toBeNull();
    expect(document.querySelector('input[type="color"]')).toBeNull();
    expect(document.querySelector('input[type="range"]')).toBeNull();
  });

  it("altera a matiz, preserva o contrato de chave e atualiza a barra", () => {
    const onChange = vi.fn();

    render(
      <LabelColorPicker
        value={"blue" satisfies LabelColorKey}
        onChange={onChange}
        previewName={treeName}
      />,
    );

    fireEvent.keyDown(screen.getByLabelText("Hue"), { key: "ArrowRight" });

    expect(onChange).toHaveBeenCalledWith(
      expect.stringMatching(
        /^(slate|blue|cyan|teal|green|lime|yellow|amber|orange|red|rose|pink|fuchsia|purple|violet|indigo)$/,
      ),
    );
    expect(
      screen.getByTestId("mantine-hue-slider").getAttribute("data-value"),
    ).toBe("120");
  });

  it("torna uma árvore sem cor visualmente colorida ao mover a matiz", () => {
    const onChange = vi.fn();

    render(
      <LabelColorPicker
        value={null}
        onChange={onChange}
        previewName={treeName}
        fallbackColor="slate"
      />,
    );

    fireEvent.click(screen.getByLabelText("Hue"));
    fireEvent.keyDown(screen.getByLabelText("Hue"), { key: "ArrowRight" });

    const selectedKeys = onChange.mock.calls.map(([key]) => key);

    expect(selectedKeys).not.toContain("slate");
    expect(new Set(selectedKeys).size).toBeGreaterThan(1);
  });

  it("controla a barra com a matiz efetiva da chave persistida", () => {
    render(
      <LabelColorPicker
        value={"blue" satisfies LabelColorKey}
        onChange={vi.fn()}
        previewName={treeName}
      />,
    );

    expect(
      screen.getByTestId("mantine-hue-slider").getAttribute("data-value"),
    ).toBe(
      String(
        hexToHsv(
          normalizeLabelPickerColor(
            getLabelColor(treeName, "light", "blue").dot,
          ),
        )?.[0],
      ),
    );
  });

  it("usa a cor padrão informada para a prévia de uma árvore sem cor", () => {
    render(
      <LabelColorPicker
        value={null}
        onChange={vi.fn()}
        previewName={treeName}
        fallbackColor="slate"
      />,
    );

    expect(
      screen.getByRole("img", { name: "Selected color" }).getAttribute("color"),
    ).toBe("#6b7a90");
  });
});
