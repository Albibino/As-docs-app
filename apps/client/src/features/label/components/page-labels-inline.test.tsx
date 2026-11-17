import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PageLabelsInline } from "./page-labels-inline";
import { usePageLabels } from "@/features/label/hooks/use-page-labels.ts";
import { getLabelHierarchyColor } from "@/features/label/utils/label-colors.ts";
import type { IPageLabelDisplay } from "@/features/label/types/label.types.ts";

vi.mock("@mantine/core", () => {
  const Popover = ({ children }: any) => <div>{children}</div>;
  Popover.Target = ({ children }: any) => <div>{children}</div>;
  Popover.Dropdown = ({ children, className }: any) => (
    <div data-testid="popover-dropdown" className={className}>
      {children}
    </div>
  );
  return { Popover, useComputedColorScheme: () => "light" };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/label/components/label-chip.tsx", () => ({
  LabelChip: ({ label, compactTaxonomy, variant, colorOverride }: any) => (
    <span
      data-testid="label-chip"
      data-compact-taxonomy={String(compactTaxonomy)}
      data-variant={variant}
      data-color-dot={colorOverride?.dot}
    >
      {compactTaxonomy && label.taxonomy && label.tree
        ? `${label.tree.name} : ${label.path.split(" / ").length > 2 ? "/ " : ""}${label.name}`
        : label.name}
    </span>
  ),
}));

vi.mock("@/features/label/components/label-picker.tsx", () => ({
  LabelPicker: () => null,
}));

vi.mock("@/features/label/hooks/use-page-labels.ts", () => ({
  usePageLabels: vi.fn(),
}));

const mockedUsePageLabels = vi.mocked(usePageLabels);

describe("PageLabelsInline", () => {
  beforeEach(() => {
    mockedUsePageLabels.mockReturnValue({
      labels: [
        {
          id: "node-dependentes",
          name: "Meus dependentes",
          color: "blue",
          treeId: "tree-modulos",
          tree: {
            id: "tree-modulos",
            name: "Módulos Senior",
            slug: "modulos-senior",
            color: "blue",
            position: 0,
          },
          path: "Módulos Senior / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes",
          taxonomy: true,
          hierarchyDepth: 5,
        },
      ],
      isLoading: false,
      apply: vi.fn(),
      select: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    });
  });

  it("exibe o formato compacto no cabeçalho do documento", () => {
    render(
      <PageLabelsInline pageId="page-1" spaceId="space-1" canEdit={false} />,
    );

    const chip = screen.getByTestId("label-chip");
    expect(chip.textContent).toBe("Módulos Senior : / Meus dependentes");
    expect(chip.getAttribute("data-compact-taxonomy")).toBe("true");
    expect(chip.getAttribute("data-variant")).toBe("solid");
    expect(chip.getAttribute("data-color-dot")).toBe(
      getLabelHierarchyColor("Módulos Senior", "blue", 5, "light").dot,
    );
  });

  it("mantém labels livres no modo padrão sem cor hierárquica", () => {
    mockedUsePageLabels.mockReturnValue({
      labels: [
        {
          id: "free-label",
          name: "Urgente",
          color: "red",
          treeId: null,
          tree: null,
          path: "Urgente",
          taxonomy: false,
        },
      ],
      isLoading: false,
      apply: vi.fn(),
      select: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    });

    render(
      <PageLabelsInline pageId="page-1" spaceId="space-1" canEdit={false} />,
    );

    const chip = screen.getByTestId("label-chip");
    expect(chip.getAttribute("data-variant")).toBeNull();
    expect(chip.getAttribute("data-color-dot")).toBeNull();
  });

  it("usa o wrapper dimensionável no seletor do cabeçalho", () => {
    render(<PageLabelsInline pageId="page-1" spaceId="space-1" canEdit />);

    expect(screen.getByTestId("popover-dropdown").className).toContain(
      "popoverDropdown",
    );
  });

  it("mantém o formato compacto e sem expansão nos chips do overflow", () => {
    const baseLabel: IPageLabelDisplay = {
      id: "node-dependentes",
      name: "Meus dependentes",
      color: "blue",
      treeId: "tree-modulos",
      tree: {
        id: "tree-modulos",
        name: "Módulos Senior",
        slug: "modulos-senior",
        color: "blue",
        position: 0,
      },
      path: "Módulos Senior / HCM / Meus dependentes",
      taxonomy: true,
      hierarchyDepth: 2,
    };
    mockedUsePageLabels.mockReturnValue({
      labels: Array.from({ length: 5 }, (_, index) => ({
        ...baseLabel,
        id: `node-${index}`,
        name: `Label ${index}`,
      })),
      isLoading: false,
      apply: vi.fn(),
      select: vi.fn(),
      create: vi.fn(),
      remove: vi.fn(),
    });

    render(<PageLabelsInline pageId="page-1" spaceId="space-1" canEdit />);

    const chips = screen.getAllByTestId("label-chip");
    expect(chips).toHaveLength(5);
    expect(
      chips.every(
        (chip) => chip.getAttribute("data-compact-taxonomy") === "true",
      ),
    ).toBe(true);
  });
});
