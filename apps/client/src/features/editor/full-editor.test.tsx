import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FullEditor } from "./full-editor";
import { PageEditMode } from "@/features/user/types/user.types.ts";

const testState = vi.hoisted(() => ({
  pageEditMode: "edit",
}));

vi.mock("jotai", () => ({
  useAtom: (atom: string) => {
    if (atom === "userAtom") {
      return [
        {
          settings: {
            preferences: {
              fullPageWidth: false,
              editorToolbar: false,
              pageEditMode: PageEditMode.Edit,
            },
          },
        },
        vi.fn(),
      ];
    }

    return [testState.pageEditMode, vi.fn()];
  },
}));

vi.mock("@/features/user/atoms/current-user-atom.ts", () => ({
  userAtom: "userAtom",
}));

vi.mock("@/features/editor/atoms/editor-atoms.ts", () => ({
  currentPageEditModeAtom: "currentPageEditModeAtom",
}));

vi.mock("@mantine/core", async () => {
  const components = {
    ActionIcon: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
    Container: ({ children }: any) => <div>{children}</div>,
    Divider: () => <hr />,
    Group: ({ children }: any) => <div>{children}</div>,
    Stack: ({ children }: any) => <div>{children}</div>,
    Text: ({ children }: any) => <span>{children}</span>,
    Tooltip: ({ children }: any) => <>{children}</>,
    UnstyledButton: ({ children, ...props }: any) => (
      <button {...props}>{children}</button>
    ),
  };
  const Popover = ({ children }: any) => <div>{children}</div>;
  Popover.Target = ({ children }: any) => <>{children}</>;
  Popover.Dropdown = ({ children }: any) => <div>{children}</div>;
  return { ...components, Popover };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/features/editor/title-editor", () => ({
  TitleEditor: () => <div data-testid="title-editor" />,
}));

vi.mock("@/features/editor/page-editor", () => ({
  default: () => <div data-testid="page-editor" />,
}));

vi.mock("@/features/editor/components/fixed-toolbar/fixed-toolbar", () => ({
  FixedToolbar: () => <div />,
}));

vi.mock("@/features/page/trash/components/deleted-page-banner.tsx", () => ({
  DeletedPageBanner: () => <div />,
}));

vi.mock("@/components/ui/custom-avatar.tsx", () => ({
  CustomAvatar: () => <div />,
}));

vi.mock("@/hooks/use-toggle-aside.tsx", () => ({
  useAsideTriggerProps: () => ({}),
}));

vi.mock("@/features/label/components/page-labels-inline.tsx", () => ({
  PageLabelsInline: ({ canEdit }: { canEdit: boolean }) => (
    <div data-testid="page-labels" data-can-edit={String(canEdit)} />
  ),
}));

const editorProps = {
  pageId: "page-1",
  slugId: "page-1",
  title: "Documento",
  content: "",
  spaceId: "space-1",
  spaceSlug: "space",
  editable: true,
};

describe("FullEditor", () => {
  beforeEach(() => {
    testState.pageEditMode = PageEditMode.Edit;
  });

  it("mantém as ações de labels indisponíveis no modo Ver", () => {
    testState.pageEditMode = PageEditMode.Read;

    render(<FullEditor {...editorProps} />);

    expect(
      screen.getByTestId("page-labels").getAttribute("data-can-edit"),
    ).toBe("false");
  });

  it("permite alterar labels no modo Editar quando há permissão", () => {
    render(<FullEditor {...editorProps} />);

    expect(
      screen.getByTestId("page-labels").getAttribute("data-can-edit"),
    ).toBe("true");
  });

  it("mantém as ações de labels indisponíveis sem permissão", () => {
    render(<FullEditor {...editorProps} editable={false} />);

    expect(
      screen.getByTestId("page-labels").getAttribute("data-can-edit"),
    ).toBe("false");
  });
});
