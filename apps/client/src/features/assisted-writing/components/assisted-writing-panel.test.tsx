import { Editor } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { UniqueID } from "@tcc-docs/editor-ext";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MantineProvider } from "@mantine/core";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import i18n from "i18next";
import { Provider, createStore } from "jotai";
import { initReactI18next } from "react-i18next";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashBlock } from "../domain/assisted-writing";
import { AssistedWritingPanel } from "./assisted-writing-panel";

const mocks = vi.hoisted(() => ({
  stream: vi.fn(),
  record: vi.fn(),
  close: vi.fn(),
}));

vi.mock("../services/assisted-writing-service", () => ({
  streamAssistedWriting: mocks.stream,
  fetchSpacePages: vi.fn().mockResolvedValue([]),
}));
vi.mock("../services/session-api", () => ({
  recordApplication: mocks.record,
  closeServerSession: mocks.close,
}));
vi.mock("../hooks/use-page-metadata", () => ({
  usePageMetadata: () => ({
    setTitle: vi.fn(),
    createLabel: vi.fn(),
    removeLabel: vi.fn(),
    restoreLabel: vi.fn(),
  }),
}));
vi.mock("@/features/page/queries/page-query", () => ({
  usePageQuery: () => ({ data: { title: "Onboarding", spaceId: "space-1" } }),
}));
vi.mock("@/features/label/queries/label-query", () => ({
  usePageLabelsQuery: () => ({ data: undefined }),
  useAvailableLabelsQuery: () => ({ data: undefined }),
}));

beforeAll(async () => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  });
  // Mantine's autosizing textarea listens to font loading; jsdom has no
  // document.fonts.
  Object.defineProperty(document, "fonts", {
    configurable: true,
    value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
  });
  // Without translations every key renders as written, with {{vars}} filled.
  await i18n.use(initReactI18next).init({
    lng: "en-US",
    resources: {},
    interpolation: { escapeValue: false },
  });
});

const WRONG = "no primeiro dia o colaborador tem q fazer o cadastro";
const FIXED = "No primeiro dia o colaborador tem que fazer o cadastro";

function createEditor() {
  return new Editor({
    extensions: [StarterKit, UniqueID.configure({ types: ["paragraph"] })],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { id: "p1" },
          content: [{ type: "text", text: WRONG }],
        },
      ],
    },
  });
}

async function replaceOperation(editor: Editor) {
  return {
    action: "replace" as const,
    blockId: "p1",
    baseHash: await hashBlock(editor.getJSON().content![0]),
    content: [{ type: "text", text: FIXED }],
  };
}

function renderPanel(editor: Editor) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <Provider store={createStore()}>
        <MantineProvider>
          <AssistedWritingPanel editor={editor as any} pageId="page-1" />
        </MantineProvider>
      </Provider>
    </QueryClientProvider>,
  );
}

async function ask(text: string) {
  fireEvent.click(screen.getByLabelText("Open assisted writing"));
  const input = await screen.findByPlaceholderText(/Ask for a change/);
  fireEvent.change(input, { target: { value: text } });
  fireEvent.click(screen.getByLabelText("Send request"));
}

describe("AssistedWritingPanel", () => {
  let editor: Editor;

  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });
    mocks.stream.mockReset();
    mocks.record.mockReset();
    mocks.close.mockResolvedValue(undefined);
    mocks.record.mockResolvedValue({
      versionId: "v1",
      applicationId: "a1",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    editor = createEditor();
  });

  afterEach(() => {
    cleanup();
    editor.destroy();
    vi.unstubAllGlobals();
  });

  it("opens and closes from the launcher", async () => {
    renderPanel(editor);
    expect(screen.queryByText("How can I help with this page?")).toBeNull();
    fireEvent.click(screen.getByLabelText("Open assisted writing"));
    expect(
      await screen.findByText("How can I help with this page?"),
    ).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() =>
      expect(screen.queryByText("How can I help with this page?")).toBeNull(),
    );
  });

  it("sends the request with the page blocks and shows before/after", async () => {
    const operation = await replaceOperation(editor);
    mocks.stream.mockResolvedValue({ operations: [operation] });
    renderPanel(editor);
    await ask("Fix the spelling");

    const accept = await screen.findByRole("button", {
      name: "Accept safe changes",
    });
    expect(accept).toBeTruthy();
    expect(mocks.stream).toHaveBeenCalledTimes(1);
    const sent = mocks.stream.mock.calls[0][0];
    expect(sent).toMatchObject({
      pageId: "page-1",
      request: "Fix the spelling",
      title: "Onboarding",
    });
    expect(sent.blocks).toHaveLength(1);
    expect(sent.blocks[0].blockId).toBe("p1");

    expect(screen.getByText("Alterar parágrafo")).toBeTruthy();
    const removed = screen.getByText(WRONG);
    expect(removed.className).toMatch(/before/);
    expect(screen.getByText(FIXED).className).toMatch(/after/);
    expect(editor.getText()).toBe(WRONG);
  });

  it("applies the proposal on accept and offers undo", async () => {
    mocks.stream.mockResolvedValue({
      operations: [await replaceOperation(editor)],
    });
    renderPanel(editor);
    await ask("Fix the spelling");
    fireEvent.click(
      await screen.findByRole("button", { name: "Accept safe changes" }),
    );

    await waitFor(() => expect(editor.getText()).toBe(FIXED));
    expect(mocks.record).toHaveBeenCalledTimes(1);
    expect(mocks.record.mock.calls[0][0]).toMatchObject({
      pageId: "page-1",
      operations: [{ action: "replace", blockId: "p1" }],
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Undo AI application" }),
    );
    await waitFor(() => expect(editor.getText()).toBe(WRONG));
  });

  it("leaves the document alone when the proposal is refused", async () => {
    mocks.stream.mockResolvedValue({
      operations: [await replaceOperation(editor)],
    });
    renderPanel(editor);
    await ask("Fix the spelling");
    fireEvent.click(await screen.findByRole("button", { name: "Refuse" }));

    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Accept safe changes" })).toBeNull(),
    );
    expect(editor.getText()).toBe(WRONG);
    expect(mocks.record).not.toHaveBeenCalled();
  });

  it("shows the reason when the service answers with no action", async () => {
    mocks.stream.mockResolvedValue({
      operations: [],
      noChangeReason: "The page says nothing about France.",
    });
    renderPanel(editor);
    await ask("What is the capital of France?");

    expect(await screen.findByText("No changes proposed")).toBeTruthy();
    expect(screen.getByText("The page says nothing about France.")).toBeTruthy();
    expect(screen.getByText("What is the capital of France?")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Accept safe changes" })).toBeNull();
    expect(editor.getText()).toBe(WRONG);
  });

  it("shows a visible error when the request fails", async () => {
    mocks.stream.mockRejectedValue(new Error("boom"));
    renderPanel(editor);
    await ask("Fix the spelling");

    expect(
      await screen.findByText("Something went wrong. Please try again."),
    ).toBeTruthy();
    expect(editor.getText()).toBe(WRONG);
  });
});
