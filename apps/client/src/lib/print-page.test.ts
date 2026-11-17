import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PRINT_ROOT_CLASS,
  printCurrentPage,
  printPage,
  registerPrintShortcut,
} from "./print-page";

const COLOR_SCHEME_ATTRIBUTE = "data-mantine-color-scheme";

function mountPage(html = "<h1>Untitled</h1>"): HTMLElement {
  const root = document.createElement("div");
  root.className = PRINT_ROOT_CLASS;
  root.innerHTML = html;
  document.body.appendChild(root);
  return root;
}

function printFrames(): HTMLIFrameElement[] {
  return [...document.querySelectorAll("iframe")];
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
  document.documentElement.removeAttribute(COLOR_SCHEME_ATTRIBUTE);
});

describe("printPage", () => {
  it("never repaints the document the reader is looking at", async () => {
    document.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, "dark");
    const root = mountPage();

    await printPage(root);

    expect(document.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE)).toBe(
      "dark",
    );
  });

  it("copies the page into a frame pinned to the light palette", async () => {
    document.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, "dark");
    const root = mountPage("<h1>Relatório</h1>");

    await printPage(root, { documentTitle: "Relatório" });

    const [frame] = printFrames();
    expect(frame).toBeDefined();

    const frameDocument = frame.contentDocument!;
    expect(
      frameDocument.documentElement.getAttribute(COLOR_SCHEME_ATTRIBUTE),
    ).toBe("light");
    expect(frameDocument.title).toBe("Relatório");
    expect(frameDocument.body.textContent).toContain("Relatório");
  });

  it("carries the app stylesheets over so the copy is not unstyled", async () => {
    const appStyle = document.createElement("style");
    appStyle.textContent = ".editor { color: red }";
    document.head.appendChild(appStyle);

    try {
      await printPage(mountPage());

      const frameDocument = printFrames()[0].contentDocument!;
      const styleText = [...frameDocument.head.querySelectorAll("style")]
        .map((style) => style.textContent)
        .join("\n");

      expect(styleText).toContain(".editor { color: red }");
    } finally {
      appStyle.remove();
    }
  });

  it("drops the paper margin so the browser prints no header or footer", async () => {
    await printPage(mountPage());

    const frameDocument = printFrames()[0].contentDocument!;
    const styleText = [...frameDocument.head.querySelectorAll("style")]
      .map((style) => style.textContent)
      .join("\n");

    // Chrome only omits its own date/title/URL running heads when the page box
    // has no margin, so the whitespace has to come from the content instead.
    expect(styleText).toMatch(/@page\s*{[^}]*margin:\s*0\s*[;}]/);
    expect(styleText).toMatch(
      new RegExp(`\\.${PRINT_ROOT_CLASS}\\s*{[^}]*padding:`),
    );
  });

  it("leaves the original element in place", async () => {
    const root = mountPage();

    await printPage(root);

    // The copy lives inside the frame's own document, so the page the reader
    // sees still holds exactly one printable root.
    expect(root.isConnected).toBe(true);
    expect(document.querySelectorAll(`.${PRINT_ROOT_CLASS}`).length).toBe(1);
  });
});

describe("printCurrentPage", () => {
  it("reports that there was nothing to print", () => {
    expect(printCurrentPage()).toBe(false);
  });

  it("prints the mounted page", () => {
    mountPage();
    expect(printCurrentPage()).toBe(true);
  });
});

describe("registerPrintShortcut", () => {
  it("takes over ctrl+p while a page is open", () => {
    mountPage();
    const unregister = registerPrintShortcut();

    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(true);
    unregister();
  });

  it("leaves ctrl+p to the browser outside a page", () => {
    const unregister = registerPrintShortcut();

    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    unregister();
  });

  it("ignores unrelated shortcuts", () => {
    mountPage();
    const unregister = registerPrintShortcut();

    const event = new KeyboardEvent("keydown", {
      key: "p",
      ctrlKey: true,
      shiftKey: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(event.defaultPrevented).toBe(false);
    unregister();
  });
});
