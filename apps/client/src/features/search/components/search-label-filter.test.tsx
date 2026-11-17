import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SearchLabelFilter } from "./search-label-filter";
import { useAvailableLabelsQuery } from "@/features/label/queries/label-query.ts";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@/features/label/queries/label-query.ts", () => ({
  useAvailableLabelsQuery: vi.fn(),
  useSearchableLabelsQuery: vi.fn(),
}));

vi.mock("@/features/label/components/label-path-tooltip.tsx", () => ({
  LabelPathTooltip: ({
    children,
    ariaLabel,
  }: {
    children: ReactNode;
    ariaLabel?: string;
  }) => <span aria-label={ariaLabel}>{children}</span>,
}));

vi.mock("@mantine/core", () => {
  const Menu = Object.assign(
    ({
      children,
      onChange,
    }: {
      children: ReactNode;
      onChange?: (opened: boolean) => void;
    }) => (
      <div>
        <button
          type="button"
          data-testid="close-menu"
          onClick={() => onChange?.(false)}
        >
          Close
        </button>
        {children}
      </div>
    ),
    {
      Target: ({ children }: { children: ReactNode }) => <>{children}</>,
      Dropdown: ({ children }: { children: ReactNode }) => (
        <div role="menu">{children}</div>
      ),
      Item: ({ children, ...props }: any) => (
        <button type="button" {...props}>
          {children}
        </button>
      ),
      Label: ({ children }: { children: ReactNode }) => <div>{children}</div>,
      Divider: () => <hr />,
    },
  );

  return {
    Button: ({
      children,
      leftSection,
      rightSection,
      variant,
      color,
      fw,
      size,
      ...props
    }: any) => (
      <button type="button" {...props}>
        {children}
      </button>
    ),
    Checkbox: ({ checked, onChange, onClick, ...props }: any) => (
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        onClick={onClick}
        {...props}
      />
    ),
    Group: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Menu,
    ScrollArea: {
      Autosize: ({ children }: { children: ReactNode }) => (
        <div>{children}</div>
      ),
    },
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    TextInput: ({ ...props }: any) => <input {...props} />,
    getDefaultZIndex: () => 1,
  };
});

const tree = {
  id: "tree-status",
  name: "Status",
  nodes: [
    {
      id: "node-new",
      name: "Novo",
      parentId: null,
      createdAt: "2026-01-03T00:00:00.000Z",
      position: 0,
    },
    {
      id: "node-child",
      name: "Em análise",
      parentId: "node-old",
      createdAt: "2026-01-02T00:00:00.000Z",
      position: 0,
    },
    {
      id: "node-old",
      name: "Antigo",
      parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      position: 2,
    },
  ],
};

const availableLabels = {
  trees: [tree],
  freeLabels: [
    {
      id: "free-label",
      name: "Urgente",
      position: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
    },
  ],
};

const mockedUseAvailableLabelsQuery = vi.mocked(useAvailableLabelsQuery);

function renderFilter(overrides: Record<string, unknown> = {}) {
  return render(
    <SearchLabelFilter
      value={[]}
      taxonomyFilters={[]}
      onChange={vi.fn()}
      spaceId="space-1"
      {...overrides}
    />,
  );
}

describe("SearchLabelFilter", () => {
  beforeEach(() => {
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: availableLabels,
    } as any);
  });

  it("filtra pelo nome final e por qualquer segmento do caminho", () => {
    renderFilter();

    const input = screen.getByRole("textbox", { name: "Search labels" });
    fireEvent.change(input, { target: { value: "antigo" } });

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Antigo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Antigo / Em análise" }),
    ).toBeTruthy();
    expect(screen.queryByRole("menuitemcheckbox", { name: "Novo" })).toBeNull();

    fireEvent.change(input, { target: { value: "status" } });

    expect(
      screen.getByRole("menuitemcheckbox", { name: "Antigo" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("menuitemcheckbox", { name: "Antigo / Em análise" }),
    ).toBeTruthy();
    expect(screen.getByRole("menuitemcheckbox", { name: "Novo" })).toBeTruthy();
  });

  it("mantém seleção oculta e permite selecionar a árvore inteira com a busca ativa", () => {
    const onChange = vi.fn();
    renderFilter({ value: ["node-new"], onChange });

    fireEvent.change(screen.getByRole("textbox", { name: "Search labels" }), {
      target: { value: "antigo" },
    });

    expect(screen.queryByRole("menuitemcheckbox", { name: "Novo" })).toBeNull();
    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole("checkbox", { name: "Filter this whole tree" }),
    );
    expect(onChange).toHaveBeenLastCalledWith(
      [],
      [{ treeId: "tree-status", nodeIds: [] }],
    );
  });

  it("seleciona uma label preservando o caminho completo para acessibilidade", () => {
    const onChange = vi.fn();
    renderFilter({ onChange });

    const option = screen.getByRole("menuitemcheckbox", {
      name: "Antigo / Em análise",
    });
    expect(option).toBeTruthy();
    expect(screen.getByLabelText("Antigo / Em análise")).toBeTruthy();

    fireEvent.click(option);
    expect(onChange).toHaveBeenLastCalledWith(
      ["node-child"],
      [{ treeId: "tree-status", nodeIds: ["node-child"] }],
    );
  });

  it("exibe estado vazio quando a busca não encontra opções", () => {
    renderFilter();

    fireEvent.change(screen.getByRole("textbox", { name: "Search labels" }), {
      target: { value: "inexistente" },
    });

    expect(screen.getByText("No matches")).toBeTruthy();
  });

  it("limpa a busca ao fechar e preserva a ordem das labels livres", () => {
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: {
        ...availableLabels,
        freeLabels: [
          {
            id: "free-z",
            name: "Zeta",
            position: 0,
            createdAt: "2026-01-01T00:00:00.000Z",
          },
          {
            id: "free-a",
            name: "Alfa",
            position: 1,
            createdAt: "2026-01-02T00:00:00.000Z",
          },
        ],
      },
    } as any);
    renderFilter();

    const input = screen.getByRole("textbox", { name: "Search labels" });
    fireEvent.change(input, { target: { value: "zeta" } });
    expect(screen.getByRole("menuitemcheckbox", { name: "Zeta" })).toBeTruthy();
    expect(screen.queryByRole("menuitemcheckbox", { name: "Alfa" })).toBeNull();

    fireEvent.click(screen.getByTestId("close-menu"));
    expect((input as HTMLInputElement).value).toBe("");

    const freeOptions = screen
      .getAllByRole("menuitemcheckbox")
      .filter((option) =>
        ["Zeta", "Alfa"].includes(option.textContent?.trim() ?? ""),
      );
    expect(freeOptions.map((option) => option.textContent?.trim())).toEqual([
      "Zeta",
      "Alfa",
    ]);
  });

  it("ordena raízes e filhos pela ordem de cadastro em pré-ordem", () => {
    mockedUseAvailableLabelsQuery.mockReturnValue({
      data: { ...availableLabels, freeLabels: [] },
    } as any);
    renderFilter();

    const options = screen.getAllByRole("menuitemcheckbox");
    expect(options.map((option) => option.textContent?.trim())).toEqual([
      "Antigo",
      "Antigo / Em análise",
      "Novo",
    ]);
  });
});
