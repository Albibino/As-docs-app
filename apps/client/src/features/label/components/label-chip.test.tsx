import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LabelChip } from "./label-chip";
import type {
  ILabelTreeSummary,
  IPageLabelDisplay,
} from "@/features/label/types/label.types.ts";
import { getLabelChipBackground } from "@/features/label/utils/label-colors.ts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) =>
      values ? `${key} ${JSON.stringify(values)}` : key,
  }),
}));

vi.mock("@mantine/core", () => ({
  useComputedColorScheme: () => "light",
  Tooltip: ({
    children,
    label,
    disabled,
    multiline,
    withArrow,
    withinPortal,
    openDelay,
    opened,
  }: any) => (
    <span
      data-testid="label-path-tooltip"
      data-tooltip-label={label}
      data-tooltip-disabled={String(disabled)}
      data-tooltip-multiline={String(multiline)}
      data-tooltip-with-arrow={String(withArrow)}
      data-tooltip-within-portal={String(withinPortal)}
      data-tooltip-open-delay={String(openDelay)}
      data-tooltip-opened={String(opened)}
    >
      {children}
    </span>
  ),
}));

const tree: ILabelTreeSummary = {
  id: "tree-modulos",
  name: "Módulos Senior",
  slug: "modulos-senior",
  color: "blue",
  position: 0,
};

const taxonomyLabel: IPageLabelDisplay = {
  id: "node-dependentes",
  name: "Meus dependentes",
  color: "blue",
  treeId: tree.id,
  tree,
  path: "Módulos Senior / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes",
  taxonomy: true,
};

const taxonomyLabelWithoutParent: IPageLabelDisplay = {
  ...taxonomyLabel,
  id: "node-perfil-academico",
  name: "Perfil Acadêmico",
  path: "Módulos Senior / Perfil Acadêmico",
  hierarchyDepth: 0,
};

const freeLabel: IPageLabelDisplay = {
  id: "free-label",
  name: "Urgente",
  color: "red",
  treeId: null,
  tree: null,
  path: "Urgente",
  taxonomy: false,
};

function renderChip(label: IPageLabelDisplay) {
  return render(
    <MemoryRouter>
      <LabelChip label={label} asLink compactTaxonomy />
    </MemoryRouter>,
  );
}

describe("LabelChip", () => {
  it("exibe árvore e último item sem barra quando a label não tem pai", () => {
    const { container } = render(
      <MemoryRouter>
        <LabelChip label={taxonomyLabelWithoutParent} asLink compactTaxonomy />
      </MemoryRouter>,
    );

    const link = screen.getByRole("link", {
      name: "Módulos Senior : Perfil Acadêmico",
    });

    expect(link.textContent).toBe("Módulos Senior : Perfil Acadêmico");
    expect(link.getAttribute("href")).toBe("/labels/node-perfil-academico");
    expect(link.getAttribute("aria-label")).toBe(
      "Módulos Senior : Perfil Acadêmico",
    );
    expect(screen.queryByTestId("label-path-tooltip")).toBeNull();
  });

  it("indica pais ocultos com barra no chip compacto", () => {
    renderChip(taxonomyLabel);

    const fullPath =
      "Módulos Senior : / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes";
    const link = screen.getByRole("link", { name: fullPath });
    const tooltip = screen.getByTestId("label-path-tooltip");

    expect(link.textContent).toBe("Módulos Senior : / Meus dependentes");
    expect(link.getAttribute("href")).toBe("/labels/node-dependentes");
    expect(link.getAttribute("aria-label")).toBe(fullPath);
    expect(tooltip.getAttribute("data-tooltip-label")).toBe(fullPath);
    expect(tooltip.getAttribute("data-tooltip-disabled")).toBe("false");
    expect(tooltip.getAttribute("data-tooltip-multiline")).toBe("true");
    expect(tooltip.getAttribute("data-tooltip-within-portal")).toBe("true");
    expect(link.getAttribute("title")).toBeNull();
    expect(tooltip.querySelectorAll("a")).toHaveLength(0);
  });

  it("mantém o caminho completo no tooltip para chips não expansíveis", () => {
    renderChip(taxonomyLabel);

    const tooltip = screen.getByTestId("label-path-tooltip");
    fireEvent.mouseEnter(
      screen.getByText("Módulos Senior : / Meus dependentes"),
    );

    expect(tooltip.getAttribute("data-tooltip-opened")).toBe("true");
  });

  it("abre o tooltip do caminho quando o link recebe foco", () => {
    renderChip(taxonomyLabel);

    const fullPath =
      "Módulos Senior : / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes";
    const link = screen.getByRole("link", { name: fullPath });
    const tooltip = screen.getByTestId("label-path-tooltip");

    fireEvent.focus(link);

    expect(tooltip.getAttribute("data-tooltip-opened")).toBe("true");
  });

  it("não ativa tooltip para label livre sem truncamento", () => {
    renderChip(freeLabel);

    const link = screen.getByRole("link", { name: freeLabel.name });

    expect(link.textContent).toBe(freeLabel.name);
    expect(link.getAttribute("aria-label")).toBeNull();
    expect(screen.queryByTestId("label-path-tooltip")).toBeNull();
  });

  it("mantém o nome da árvore sem tooltip quando a árvore inteira está selecionada", () => {
    const treeOnlyLabel: IPageLabelDisplay = {
      ...taxonomyLabel,
      id: `tree:${tree.id}`,
      name: tree.name,
      path: tree.name,
    };

    render(
      <MemoryRouter>
        <LabelChip label={treeOnlyLabel} asLink compactTaxonomy />
      </MemoryRouter>,
    );

    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.getByText(tree.name)).toBeTruthy();
    expect(screen.queryByTestId("label-path-tooltip")).toBeNull();
  });

  it("mantém a remoção do chip compacto", () => {
    const onRemove = vi.fn();

    render(
      <MemoryRouter>
        <LabelChip
          label={taxonomyLabel}
          asLink
          compactTaxonomy
          onRemove={onRemove}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /Remove label/ }));

    expect(onRemove).toHaveBeenCalledOnce();
  });

  it("renderiza o modo de ponto com o nome ao lado e sem fundo de chip", () => {
    const { container } = render(
      <MemoryRouter>
        <LabelChip
          label={taxonomyLabel}
          variant="dot"
          colorOverride={{ bg: "#e6f0ff", fg: "#ffffff", dot: "#3b82f6" }}
        />
      </MemoryRouter>,
    );

    const appearance = container.querySelector('[data-label-appearance="dot"]');

    expect(appearance).not.toBeNull();
    expect(appearance?.textContent).toBe(taxonomyLabel.name);
    expect(appearance?.querySelector('[data-label-dot="true"]')).not.toBeNull();
    const inlineStyle = appearance?.getAttribute("style") ?? "";
    expect(inlineStyle).not.toContain("background");
    expect(inlineStyle).not.toContain("255, 255, 255");
  });

  it("usa a cor da bolinha com opacidade e a fonte forte no modo sólido", () => {
    const solidColor = {
      bg: "#efe9fb",
      fg: "#5a3aa8",
      dot: "#8b6bd9",
    };
    const { container } = render(
      <MemoryRouter>
        <LabelChip
          label={taxonomyLabel}
          variant="solid"
          colorOverride={solidColor}
        />
      </MemoryRouter>,
    );

    const appearance = container.querySelector(
      '[data-label-appearance="solid"]',
    ) as HTMLElement | null;
    const expectedBackground = document.createElement("span");
    expectedBackground.style.background = solidColor.dot;

    expect(appearance).not.toBeNull();
    expect(appearance?.style.background).toBe(
      getLabelChipBackground(solidColor.dot),
    );
    expectedBackground.style.color = solidColor.fg;
    expect(appearance?.style.color).toBe(expectedBackground.style.color);
  });
});
