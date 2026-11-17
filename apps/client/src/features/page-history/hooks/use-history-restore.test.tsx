import { act, renderHook } from "@testing-library/react";
import { Provider, createStore } from "jotai";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  pageEditorAtom,
  titleEditorAtom,
  yjsSyncedAtom,
} from "@/features/editor/atoms/editor-atoms";
import {
  activeHistoryIdAtom,
  historyAtoms,
} from "@/features/page-history/atoms/history-atoms";
import {
  usePageHistoryQuery,
  usePrepareHistoryRestoreMutation,
} from "@/features/page-history/queries/page-history-query";
import { useUpdateTitlePageMutation } from "@/features/page/queries/page-query";
import { useSpaceAbility } from "@/features/space/permissions/use-space-ability";
import { useSpaceQuery } from "@/features/space/queries/space-query";
import { useHistoryRestore } from "./use-history-restore";

const {
  notificationsShow,
  openConfirmModal,
  mockedPrepareRestore,
  mockedUpdateTitle,
} = vi.hoisted(() => ({
  notificationsShow: vi.fn(),
  openConfirmModal: vi.fn(),
  mockedPrepareRestore: vi.fn(),
  mockedUpdateTitle: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("react-router-dom", () => ({
  useParams: () => ({ spaceSlug: "space-1" }),
}));

vi.mock("@mantine/modals", () => ({
  modals: { openConfirmModal },
}));

vi.mock("@mantine/notifications", () => ({
  notifications: { show: notificationsShow },
}));

vi.mock("@/features/page-history/queries/page-history-query", () => ({
  usePageHistoryQuery: vi.fn(),
  usePrepareHistoryRestoreMutation: vi.fn(),
}));

vi.mock("@/features/page/queries/page-query", () => ({
  useUpdateTitlePageMutation: vi.fn(),
}));

vi.mock("@/features/space/queries/space-query", () => ({
  useSpaceQuery: vi.fn(),
}));

vi.mock("@/features/space/permissions/use-space-ability", () => ({
  useSpaceAbility: vi.fn(),
}));

const mockedUsePageHistoryQuery = vi.mocked(usePageHistoryQuery);
const mockedUsePrepareHistoryRestoreMutation = vi.mocked(
  usePrepareHistoryRestoreMutation,
);
const mockedUseUpdateTitlePageMutation = vi.mocked(useUpdateTitlePageMutation);
const mockedUseSpaceQuery = vi.mocked(useSpaceQuery);
const mockedUseSpaceAbility = vi.mocked(useSpaceAbility);

const liveContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Live" }] }],
};
const targetContent = {
  type: "doc",
  content: [{ type: "paragraph", content: [{ type: "text", text: "Target" }] }],
};

function createEditor(textOrContent: string | object) {
  let current = textOrContent;
  const run = vi.fn(() => true);
  const setContent = vi.fn((content: string | object, _options?: object) => {
    current = content;
    return true;
  });
  const chain = vi.fn(() => ({
    clearContent: vi.fn().mockReturnThis(),
    setContent: vi.fn((content: string | object, options?: object) => {
      setContent(content, options);
      return { run };
    }),
  }));

  return {
    isDestroyed: false,
    getText: () => (typeof current === "string" ? current : ""),
    getJSON: () => (typeof current === "string" ? {} : current),
    commands: { setContent },
    chain,
    run,
  };
}

function setupHook({ synced = true }: { synced?: boolean } = {}) {
  const store = createStore();
  const pageEditor = createEditor(liveContent);
  const titleEditor = createEditor("Título vivo");
  store.set(activeHistoryIdAtom, "revision-target");
  store.set(pageEditorAtom as any, pageEditor as any);
  store.set(titleEditorAtom as any, titleEditor as any);
  store.set(yjsSyncedAtom, synced);
  store.set(historyAtoms, true);
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );
  const hook = renderHook(() => useHistoryRestore(), { wrapper });

  return { ...hook, store, pageEditor, titleEditor };
}

function getConfirmHandler() {
  const options = openConfirmModal.mock.calls.at(-1)?.[0];
  expect(options).toBeDefined();
  return options.onConfirm as () => Promise<void>;
}

describe("useHistoryRestore", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => "request-1") });
    openConfirmModal.mockReset();
    notificationsShow.mockReset();
    mockedPrepareRestore.mockReset();
    mockedUpdateTitle.mockReset();
    mockedPrepareRestore.mockResolvedValue({
      snapshot: { id: "snapshot-before-restore" },
      targetRevisionId: "revision-target",
    });
    mockedUpdateTitle.mockResolvedValue({ id: "page-1" });
    mockedUsePageHistoryQuery.mockReturnValue({
      data: {
        id: "revision-target",
        pageId: "page-1",
        title: "Alvo",
        content: targetContent,
      },
      isLoading: false,
    } as any);
    mockedUsePrepareHistoryRestoreMutation.mockReturnValue({
      mutateAsync: mockedPrepareRestore,
      isPending: false,
    } as any);
    mockedUseUpdateTitlePageMutation.mockReturnValue({
      mutateAsync: mockedUpdateTitle,
      isPending: false,
    } as any);
    mockedUseSpaceQuery.mockReturnValue({ data: { permission: {} } } as any);
    mockedUseSpaceAbility.mockReturnValue({ can: () => true } as any);
  });

  it("does not query or expose restoration actions for the current draft", () => {
    const store = createStore();
    store.set(activeHistoryIdAtom, "current-page-draft");
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );

    const { result } = renderHook(() => useHistoryRestore(), { wrapper });

    expect(mockedUsePageHistoryQuery).toHaveBeenCalledWith(undefined);
    expect(result.current.canRestore).toBe(false);

    result.current.confirmRestore();

    expect(openConfirmModal).not.toHaveBeenCalled();
  });

  it("sends the live draft before applying the selected revision", async () => {
    const { result, store, pageEditor, titleEditor } = setupHook();

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(mockedPrepareRestore).toHaveBeenCalledWith({
      pageId: "page-1",
      historyId: "revision-target",
      title: "Título vivo",
      content: liveContent,
      requestId: "request-1",
    });
    expect(mockedPrepareRestore.mock.invocationCallOrder[0]).toBeLessThan(
      mockedUpdateTitle.mock.invocationCallOrder[0],
    );
    expect(mockedUpdateTitle).toHaveBeenCalledWith({
      pageId: "page-1",
      title: "Alvo",
    });
    expect(titleEditor.commands.setContent).toHaveBeenCalledWith("Alvo", {
      emitUpdate: false,
    });
    expect(pageEditor.commands.setContent).toHaveBeenCalledWith(targetContent, {
      emitUpdate: true,
    });
    expect(store.get(activeHistoryIdAtom)).toBe("current-page-draft");
    expect(store.get(historyAtoms)).toBe(false);
    expect(notificationsShow).toHaveBeenCalledWith({
      message: "Version restored; your previous draft is available in history.",
    });
  });

  it("does not alter either editor when the previous snapshot fails", async () => {
    mockedPrepareRestore.mockRejectedValue(new Error("network"));
    const { result, store, pageEditor, titleEditor } = setupHook();

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(titleEditor.commands.setContent).not.toHaveBeenCalled();
    expect(pageEditor.commands.setContent).not.toHaveBeenCalled();
    expect(store.get(historyAtoms)).toBe(true);
    expect(notificationsShow).toHaveBeenCalledWith({
      color: "red",
      message: "Failed to restore version",
    });
  });

  it("translates known API errors without exposing backend text", async () => {
    mockedPrepareRestore.mockRejectedValue({
      response: { status: 400, data: { message: "History revision mismatch" } },
    });
    const { result } = setupHook();

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(notificationsShow).toHaveBeenCalledWith({
      color: "red",
      message: "This version is no longer available for this page.",
    });
  });

  it("does not start a restore while the collaborative editor is still syncing", async () => {
    const { result, store, pageEditor, titleEditor } = setupHook({
      synced: false,
    });

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(mockedPrepareRestore).not.toHaveBeenCalled();
    expect(mockedUpdateTitle).not.toHaveBeenCalled();
    expect(titleEditor.commands.setContent).not.toHaveBeenCalled();
    expect(pageEditor.commands.setContent).not.toHaveBeenCalled();
    expect(store.get(historyAtoms)).toBe(true);
    expect(notificationsShow).toHaveBeenCalledWith({
      color: "red",
      message: "The page is still syncing. Try again in a moment.",
    });
  });

  it("keeps the modal open and reports an error if an editor disappears", async () => {
    const { result, store, pageEditor } = setupHook();

    act(() => result.current.confirmRestore());
    pageEditor.isDestroyed = true;
    await act(async () => getConfirmHandler()());

    expect(mockedPrepareRestore).not.toHaveBeenCalled();
    expect(store.get(historyAtoms)).toBe(true);
    expect(notificationsShow).toHaveBeenCalledWith({
      color: "red",
      message: "Failed to restore version",
    });
  });

  it("keeps both editors intact when the explicit title update fails", async () => {
    mockedUpdateTitle.mockRejectedValue(new Error("network"));
    const { result, store, pageEditor, titleEditor } = setupHook();

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(mockedPrepareRestore).toHaveBeenCalledOnce();
    expect(titleEditor.commands.setContent).not.toHaveBeenCalled();
    expect(pageEditor.commands.setContent).not.toHaveBeenCalled();
    expect(store.get(historyAtoms)).toBe(true);
  });

  it("rolls the title back when applying collaborative content fails", async () => {
    const { result, store, pageEditor, titleEditor } = setupHook();
    pageEditor.run.mockImplementationOnce(() => {
      throw new Error("editor failed");
    });

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(mockedUpdateTitle).toHaveBeenNthCalledWith(1, {
      pageId: "page-1",
      title: "Alvo",
    });
    expect(mockedUpdateTitle).toHaveBeenNthCalledWith(2, {
      pageId: "page-1",
      title: "Título vivo",
    });
    expect(titleEditor.commands.setContent).toHaveBeenLastCalledWith(
      "Título vivo",
      { emitUpdate: false },
    );
    expect(store.get(historyAtoms)).toBe(true);
    expect(notificationsShow).toHaveBeenCalledWith({
      color: "red",
      message: "Failed to restore version",
    });
  });

  it("skips the title request when the selected title already matches the live title", async () => {
    mockedUsePageHistoryQuery.mockReturnValue({
      data: {
        id: "revision-target",
        pageId: "page-1",
        title: "Título vivo",
        content: targetContent,
      },
      isLoading: false,
    } as any);
    const { result } = setupHook();

    act(() => result.current.confirmRestore());
    await act(async () => getConfirmHandler()());

    expect(mockedUpdateTitle).not.toHaveBeenCalled();
  });

  it("disables restoration while the target revision or mutation is pending", () => {
    mockedUsePageHistoryQuery.mockReturnValue({
      data: undefined,
      isLoading: true,
    } as any);
    mockedUsePrepareHistoryRestoreMutation.mockReturnValue({
      mutateAsync: mockedPrepareRestore,
      isPending: true,
    } as any);

    const { result } = setupHook();

    expect(result.current.canRestore).toBe(true);
    expect(result.current.isRestoring).toBe(true);
    expect(result.current.isRestoreDisabled).toBe(true);
    result.current.confirmRestore();
    expect(openConfirmModal).not.toHaveBeenCalled();
  });

  it("does not open a second confirmation for the same restore", () => {
    const { result } = setupHook();

    act(() => {
      result.current.confirmRestore();
      result.current.confirmRestore();
    });

    expect(openConfirmModal).toHaveBeenCalledOnce();
  });
});
