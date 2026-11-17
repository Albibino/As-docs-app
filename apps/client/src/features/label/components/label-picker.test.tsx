import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabelPicker } from "./label-picker";
import { useAvailableLabelsQuery } from "@/features/label/queries/label-query.ts";
import { getLabelHierarchyColor } from "@/features/label/utils/label-colors.ts";

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

vi.mock("@/features/label/queries/label-query.ts", () => ({
  useAvailableLabelsQuery: vi.fn(),
}));

const tree = {
  id: "tree-modulo",
  name: "Módulo",
  slug: "modulo",
  color: "blue",
  position: 0,
  workspaceId: "workspace-1",
  spaceId: null,
  nodes: [
    {
      id: "node-erp",
      name: "ERP",
      slug: "erp",
      kind: "group",
      parentId: null,
      treeId: "tree-modulo",
      color: null,
    },
    {
      id: "node-apps",
      name: "Apps",
      slug: "apps",
      kind: "label",
      parentId: "node-erp",
      treeId: "tree-modulo",
      color: null,
    },
  ],
};

const freeLabel = {
  id: "label-urgent",
  name: "Urgente",
  color: "red",
  treeId: null,
  tree: null,
  path: "Urgente",
  taxonomy: false,
};

const taxonomyLabel = {
  id: "node-apps",
  name: "Apps",
  color: "blue",
  treeId: "tree-modulo",
  tree,
  path: "Módulo / ERP / Apps",
  taxonomy: true,
};

const selectedPath = {
  tree,
  selectedNodeId: "node-apps",
  nodes: tree.nodes,
};

const availableLabels = {
  trees: [tree],
  freeLabels: [
    {
      id: "label-urgent",
      name: "Urgente",
      slug: "urgente",
      description: null,
      color: "red",
      position: 0,
      kind: "label",
      parentId: null,
      treeId: null,
      workspaceId: "workspace-1",
      spaceId: null,
      createdById: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const treeWithoutColor = {
  ...tree,
  color: null,
  nodes: tree.nodes.map((node) => ({ ...node, color: null })),
};

const mockedUseAvailableLabelsQuery = vi.mocked(useAvailableLabelsQuery);

function renderPicker(overrides: Record<string, unknown> = {}) {
  const props = {
    spaceId: "space-1",
    applied: [],
    enabled: true,
    canCreate: true,
    onApply: vi.fn(),
    onSelect: vi.fn(),
    onRemove: vi.fn(),
    onCreate: vi.fn(),
    onClose: vi.fn(),
    selectedPaths: [selectedPath],
    onTruncate: vi.fn(),
    ...overrides,
  };

  return {
    ...render(<LabelPicker {...(props as any)} />),
    props,
  };
}

describe("LabelPicker", () => {
  beforeEach(() => {
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: availableLabels,
    } as any);
  });

  it("renders the tree above root nodes with progressive indentation", () => {
    renderPicker();

    const treeOption = screen.getByRole("option", { name: "Módulo" });
    const rootOption = screen.getByRole("option", {
      name: "Módulo / ERP",
    });
    const childOption = screen.getByRole("option", {
      name: "Módulo / ERP / Apps",
    });

    expect(treeOption.style.paddingLeft).toBe("");
    expect(rootOption.style.paddingLeft).toBe("26px");
    expect(childOption.style.paddingLeft).toBe("40px");
  });

  it("applies the calculated width to the complete picker", () => {
    const { container } = renderPicker();
    const picker = container.querySelector("[class*='popover']") as HTMLElement;

    expect(picker.style.getPropertyValue("--label-picker-width")).toBe("240px");
  });

  it("recalculates the complete width after filtering the tree", () => {
    const longLabel = {
      ...availableLabels.freeLabels[0],
      id: "label-long",
      name: "Módulos Senior / HCM / Painel de gestão / Meu painel / Perfil / Pessoal / Meus dependentes",
    };
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: {
        ...availableLabels,
        freeLabels: [availableLabels.freeLabels[0], longLabel],
      },
    } as any);

    const { container } = renderPicker();
    const picker = () =>
      container.querySelector("[class*='popover']") as HTMLElement;

    expect(picker().style.getPropertyValue("--label-picker-width")).toBe(
      "300px",
    );

    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "Urgente" },
    });

    expect(picker().style.getPropertyValue("--label-picker-width")).toBe(
      "240px",
    );
  });

  it("uses hierarchy tones for a tree without an explicit color", () => {
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: { ...availableLabels, trees: [treeWithoutColor] },
    } as any);
    renderPicker();

    const getDot = (name: string) =>
      screen
        .getByRole("option", { name })
        .querySelector("[class*='popoverItemDot']") as HTMLElement;

    const toCssColor = (hex: string) => {
      const channels = hex
        .slice(1)
        .match(/.{2}/g)
        ?.map((value) => Number.parseInt(value, 16));
      return `rgb(${channels?.join(", ")})`;
    };

    expect(getDot("Módulo").style.background).toBe(
      toCssColor(getLabelHierarchyColor("Módulo", "slate", 0).dot),
    );
    expect(getDot("Módulo / ERP").style.background).toBe(
      toCssColor(getLabelHierarchyColor("Módulo", "slate", 0).dot),
    );
    expect(getDot("Módulo / ERP / Apps").style.background).toBe(
      toCssColor(getLabelHierarchyColor("Módulo", "slate", 1).dot),
    );
  });

  it("derives node colors from tree depth despite a legacy node color", () => {
    const coloredNodeTree = {
      ...tree,
      nodes: tree.nodes.map((node) =>
        node.id === "node-erp" ? { ...node, color: "pink" as const } : node,
      ),
    };
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: { ...availableLabels, trees: [coloredNodeTree] },
    } as any);
    renderPicker();

    const getDot = (name: string) =>
      screen
        .getByRole("option", { name })
        .querySelector("[class*='popoverItemDot']") as HTMLElement;

    expect(getDot("Módulo / ERP").style.background).toBe(
      getDot("Módulo").style.background,
    );
    expect(getDot("Módulo / ERP / Apps").style.background).not.toBe(
      getDot("Módulo / ERP").style.background,
    );
  });

  it("uses the tree fallback color for legacy orphan nodes", () => {
    const orphanTree = {
      ...treeWithoutColor,
      nodes: [
        {
          ...treeWithoutColor.nodes[0],
          id: "node-orphan",
          name: "Órfão",
          slug: "orfao",
          parentId: "missing-parent",
        },
      ],
    };
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: { ...availableLabels, trees: [orphanTree] },
    } as any);
    renderPicker();

    const treeDot = screen
      .getByRole("option", { name: "Módulo" })
      .querySelector("[class*='popoverItemDot']") as HTMLElement;
    const orphanDot = screen
      .getByRole("option", { name: "Módulo / Órfão" })
      .querySelector("[class*='popoverItemDot']") as HTMLElement;

    expect(orphanDot.style.background).toBe(treeDot.style.background);
  });

  it("selects the tree itself and replaces the active taxonomy path", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    renderPicker({ applied: [taxonomyLabel], onSelect, onRemove });

    fireEvent.click(screen.getByRole("option", { name: "Módulo" }));

    expect(onSelect).toHaveBeenCalledWith("tree-modulo", null);
    expect(onRemove).not.toHaveBeenCalled();
  });

  it("removes the active tree-only selection when clicked again", () => {
    const treeOnlyLabel = {
      ...taxonomyLabel,
      id: "tree:tree-modulo",
      name: "Módulo",
      path: "Módulo",
    };
    const onRemove = vi.fn();
    renderPicker({ applied: [treeOnlyLabel], onRemove });

    fireEvent.click(screen.getByRole("option", { name: "Módulo" }));

    expect(onRemove).toHaveBeenCalledWith(treeOnlyLabel);
  });

  it("does not render a separate selected path panel", () => {
    renderPicker({ applied: [taxonomyLabel] });

    expect(screen.queryByRole("button", { name: "Módulo" })).toBeNull();
    expect(screen.queryByRole("button", { name: "ERP" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Apps" })).toBeNull();
    expect(
      screen.getByRole("option", { name: "Módulo / ERP / Apps" }),
    ).toBeTruthy();
  });

  it("selects another node directly without removing the current path", () => {
    const onSelect = vi.fn();
    const onRemove = vi.fn();
    renderPicker({ applied: [taxonomyLabel], onSelect, onRemove });

    fireEvent.click(screen.getByRole("option", { name: "Módulo / ERP" }));

    expect(onSelect).toHaveBeenCalledWith("tree-modulo", "node-erp");
    expect(onRemove).not.toHaveBeenCalled();
    expect(
      screen.getByRole("option", { name: "Módulo / ERP / Apps" }),
    ).toBeTruthy();
  });

  it("removes the taxonomy path when clicking its selected node again", () => {
    const onRemove = vi.fn();
    renderPicker({ applied: [taxonomyLabel], onRemove });

    fireEvent.click(
      screen.getByRole("option", { name: "Módulo / ERP / Apps" }),
    );

    expect(onRemove).toHaveBeenCalledWith(taxonomyLabel);
  });

  it("keeps free label creation, selection and removal available", () => {
    const onApply = vi.fn();
    const onCreate = vi.fn();
    const onRemove = vi.fn();
    const { rerender, props } = renderPicker({ onApply, onCreate, onRemove });

    fireEvent.click(screen.getByRole("option", { name: "Urgente" }));
    expect(onApply).toHaveBeenCalledWith("label-urgent");

    const input = screen.getByRole("combobox");
    fireEvent.change(input, { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("option", { name: /Create/ }));
    expect(onCreate).toHaveBeenCalledWith("Nova");

    rerender(
      <LabelPicker
        {...(props as any)}
        applied={[freeLabel]}
        onApply={onApply}
        onCreate={onCreate}
        onRemove={onRemove}
      />,
    );
    fireEvent.click(screen.getByRole("option", { name: "Urgente" }));
    expect(onRemove).toHaveBeenCalledWith(freeLabel);
  });

  it("shows the full hierarchical path in a multiline tooltip", () => {
    renderPicker();

    const option = screen.getByRole("option", {
      name: "Módulo / ERP / Apps",
    });
    const tooltip = option.querySelector('[data-testid="label-path-tooltip"]');

    expect(option.getAttribute("aria-label")).toBe("Módulo / ERP / Apps");
    expect(option.getAttribute("title")).toBeNull();
    expect(tooltip?.getAttribute("data-tooltip-label")).toBe(
      "Módulo / ERP / Apps",
    );
    expect(tooltip?.getAttribute("data-tooltip-disabled")).toBe("false");
    expect(tooltip?.getAttribute("data-tooltip-multiline")).toBe("true");
    expect(tooltip?.getAttribute("data-tooltip-with-arrow")).toBe("true");
    expect(tooltip?.getAttribute("data-tooltip-within-portal")).toBe("true");
    expect(tooltip?.getAttribute("data-tooltip-open-delay")).toBe("250");
  });

  it("does not enable a tooltip for a simple label without truncation", () => {
    renderPicker();

    const option = screen.getByRole("option", { name: "Urgente" });
    const tooltip = option.querySelector('[data-testid="label-path-tooltip"]');

    expect(tooltip?.getAttribute("data-tooltip-disabled")).toBe("true");
  });

  it("opens the highlighted path tooltip during keyboard navigation", () => {
    renderPicker();

    const input = screen.getByRole("combobox");
    fireEvent.keyDown(input, { key: "ArrowDown" });

    const option = screen.getByRole("option", { name: "Módulo / ERP" });
    const tooltip = option.querySelector('[data-testid="label-path-tooltip"]');

    expect(input.getAttribute("aria-activedescendant")).toBe(
      option.getAttribute("id"),
    );
    expect(tooltip?.getAttribute("data-tooltip-opened")).toBe("true");
  });

  it("opens the path tooltip when an option receives keyboard focus", () => {
    renderPicker();

    const option = screen.getByRole("option", { name: "Módulo / ERP" });
    const tooltip = option.querySelector('[data-testid="label-path-tooltip"]');

    fireEvent.focus(option);

    expect(tooltip?.getAttribute("data-tooltip-opened")).toBe("true");
  });
});
