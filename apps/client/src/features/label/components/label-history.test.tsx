import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LabelHistory } from "./label-history";
import { usePageLabelHistoryQuery } from "@/features/label/queries/label-query.ts";

vi.mock("@mantine/core", () => {
  const Divider = () => <hr data-testid="history-divider" />;
  const Group = ({ children }: any) => <div>{children}</div>;
  const Stack = ({ children }: any) => <div>{children}</div>;
  const Text = ({ children }: any) => <span>{children}</span>;
  return { Divider, Group, Stack, Text };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string>) =>
      values ? `${key} ${Object.values(values).join(" ")}` : key,
  }),
}));

vi.mock("@/components/ui/custom-avatar.tsx", () => ({
  CustomAvatar: () => <span data-testid="avatar" />,
}));

vi.mock("@/hooks/use-time-ago.tsx", () => ({
  useTimeAgo: () => "today",
}));

vi.mock("@/features/label/queries/label-query.ts", () => ({
  usePageLabelHistoryQuery: vi.fn(),
}));

const mockedUsePageLabelHistoryQuery = vi.mocked(usePageLabelHistoryQuery);

const entry = {
  id: "history-1",
  event: "page.label_added",
  changes: {
    after: {
      label: {
        id: "label-1",
        name: "Urgente",
        color: "red",
        treeId: null,
        parentId: null,
        kind: "label",
        treeName: null,
      },
    },
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  actor: null,
};

describe("LabelHistory", () => {
  beforeEach(() => {
    mockedUsePageLabelHistoryQuery.mockReturnValue({
      data: { items: [entry] },
    } as any);
  });

  it("renderiza o separador antes do histórico quando solicitado", () => {
    render(<LabelHistory pageId="page-1" withDivider />);

    expect(screen.getByTestId("history-divider")).toBeTruthy();
    expect(screen.getByText("Label activity")).toBeTruthy();
  });

  it("não renderiza separador quando não há histórico", () => {
    mockedUsePageLabelHistoryQuery.mockReturnValue({
      data: { items: [] },
    } as any);

    render(<LabelHistory pageId="page-1" withDivider />);

    expect(screen.queryByTestId("history-divider")).toBeNull();
    expect(screen.queryByText("Label activity")).toBeNull();
  });
});
