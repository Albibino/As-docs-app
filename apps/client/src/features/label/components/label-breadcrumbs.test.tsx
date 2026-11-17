import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { LabelBreadcrumbs } from "./label-breadcrumbs";
import type { ILabelInfo } from "@/features/label/types/label.types";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const taxonomyLabel = {
  id: "node-apps",
  name: "Apps",
  targetType: "label",
  treeId: "tree-modulo",
  tree: {
    id: "tree-modulo",
    name: "Módulo",
  },
  ancestors: [
    { id: "node-erp", name: "ERP" },
    { id: "node-controladoria", name: "Controladoria" },
  ],
} as ILabelInfo;

describe("LabelBreadcrumbs", () => {
  it("renders the tree, clickable ancestors and current label", () => {
    render(
      <MemoryRouter>
        <LabelBreadcrumbs label={taxonomyLabel} />
      </MemoryRouter>,
    );

    const breadcrumb = screen.getByRole("navigation", { name: "Label path" });
    expect(breadcrumb.textContent).toContain("Módulo");
    expect(breadcrumb.textContent).toContain("ERP");
    expect(breadcrumb.textContent).toContain("Controladoria");
    expect(breadcrumb.textContent).toContain("Apps");

    expect(
      screen.getByRole("link", { name: "Módulo" }).getAttribute("href"),
    ).toBe("/labels/tree-modulo");
    expect(screen.getByRole("link", { name: "ERP" }).getAttribute("href")).toBe(
      "/labels/node-erp",
    );
    expect(
      screen.getByRole("link", { name: "Controladoria" }).getAttribute("href"),
    ).toBe("/labels/node-controladoria");
    expect(screen.queryByRole("link", { name: "Apps" })).toBeNull();
    expect(screen.getByText("Apps").getAttribute("aria-current")).toBe("page");
  });

  it("renders a free label without a taxonomy tree", () => {
    render(
      <MemoryRouter>
        <LabelBreadcrumbs
          label={
            {
              id: "free",
              name: "Urgente",
              targetType: "label",
              tree: null,
              ancestors: [],
            } as ILabelInfo
          }
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Label path" }).textContent,
    ).toContain("Urgente");
    expect(screen.getByText("Urgente").getAttribute("aria-current")).toBe(
      "page",
    );
    expect(screen.queryByText("ERP")).toBeNull();
  });

  it("renders a tree target as the current breadcrumb item", () => {
    render(
      <MemoryRouter>
        <LabelBreadcrumbs
          label={
            {
              id: "tree-modulo",
              name: "Módulo",
              slug: "modulo",
              description: null,
              color: "blue",
              position: 0,
              workspaceId: "workspace-1",
              spaceId: null,
              createdById: null,
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-01T00:00:00.000Z",
              targetType: "tree",
              ancestors: [],
            } as ILabelInfo
          }
        />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("navigation", { name: "Label path" }).textContent,
    ).toContain("Módulo");
    expect(screen.queryByRole("link", { name: "Módulo" })).toBeNull();
    expect(screen.getByText("Módulo").getAttribute("aria-current")).toBe(
      "page",
    );
  });
});
