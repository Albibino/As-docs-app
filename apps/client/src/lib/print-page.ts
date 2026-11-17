const COLOR_SCHEME_ATTRIBUTE = "data-mantine-color-scheme";
export const PRINT_ROOT_CLASS = "page-print-root";

const ASSET_TIMEOUT_MS = 5000;
const CLEANUP_TIMEOUT_MS = 60000;

// Paper is white whatever the reader's theme is, but Mantine resolves
// `light-dark()` from the colour-scheme attribute on `<html>` — so forcing the
// light palette on the live document would repaint the screen behind the print
// dialog. Print a throwaway copy in an offscreen iframe instead: the copy is
// pinned to light, the page the reader is looking at is never touched.
const PRINT_STYLES = `
  html, body {
    margin: 0;
    padding: 0;
    background: #fff;
    height: auto;
    overflow: visible;
  }
  .${PRINT_ROOT_CLASS} {
    max-width: none;
    height: auto;
    max-height: none;
    overflow: visible;
    padding: 12mm;
  }
  /* Chrome prints its own running head — the date, the document title and the
     URL — in whatever room the page margin leaves it, and no property turns it
     off. Zeroing the margin removes the room, so the whitespace has to be the
     content's own padding. */
  @page {
    margin: 0;
  }
`;

export interface PrintPageOptions {
  // Names the file Chrome offers when the destination is "Save as PDF".
  documentTitle?: string;
}

export async function printPage(
  element: HTMLElement,
  options: PrintPageOptions = {},
): Promise<void> {
  const iframe = createPrintFrame();
  document.body.appendChild(iframe);

  try {
    const frameDocument = iframe.contentDocument;
    const frameWindow = iframe.contentWindow;
    if (!frameDocument || !frameWindow) return;

    frameDocument.open();
    frameDocument.write(
      "<!doctype html><html><head></head><body></body></html>",
    );
    frameDocument.close();

    // Custom properties the app publishes on `:root` at runtime — the editor's
    // pin offset and header height among them — live in an inline style that no
    // stylesheet carries.
    frameDocument.documentElement.style.cssText =
      document.documentElement.style.cssText;
    frameDocument.documentElement.setAttribute(COLOR_SCHEME_ATTRIBUTE, "light");
    frameDocument.documentElement.lang = document.documentElement.lang;
    frameDocument.title = options.documentTitle ?? document.title;

    copyStyles(frameDocument);
    frameDocument.body.appendChild(element.cloneNode(true));

    await waitForAssets(frameWindow, frameDocument);

    frameWindow.focus();
    frameWindow.print();
  } finally {
    scheduleCleanup(iframe);
  }
}

// Prints the page the reader is on, if there is one. Returns false when no
// printable page is mounted, so callers can fall back to the browser.
export function printCurrentPage(options: PrintPageOptions = {}): boolean {
  const root = document.querySelector<HTMLElement>(`.${PRINT_ROOT_CLASS}`);
  if (!root) return false;

  void printPage(root, options);
  return true;
}

// Ctrl/Cmd+P has to go through the same path as the menu item, or the shortcut
// would print the live document and come out in the reader's dark theme.
export function registerPrintShortcut(): () => void {
  const handleKeyDown = (event: KeyboardEvent) => {
    if (event.key !== "p" && event.key !== "P") return;
    if (!event.ctrlKey && !event.metaKey) return;
    if (event.altKey || event.shiftKey) return;

    if (printCurrentPage()) {
      event.preventDefault();
    }
  };

  window.addEventListener("keydown", handleKeyDown);
  return () => window.removeEventListener("keydown", handleKeyDown);
}

function createPrintFrame(): HTMLIFrameElement {
  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.setAttribute("tabindex", "-1");
  iframe.title = "print";
  // Kept on-screen but invisible: a `display: none` frame does not lay out, and
  // an unlaid-out frame prints blank.
  iframe.style.cssText = [
    "position: fixed",
    "right: 0",
    "bottom: 0",
    "width: 1px",
    "height: 1px",
    "opacity: 0",
    "border: 0",
    "pointer-events: none",
  ].join(";");

  return iframe;
}

function copyStyles(frameDocument: Document): void {
  const sources = document.querySelectorAll<HTMLElement>(
    'link[rel="stylesheet"], style',
  );

  for (const source of sources) {
    frameDocument.head.appendChild(source.cloneNode(true));
  }

  // Stylesheets built at runtime through the CSSOM have no matching element to
  // clone, so their rules are re-serialised by hand.
  for (const sheet of document.adoptedStyleSheets ?? []) {
    const style = frameDocument.createElement("style");
    style.textContent = [...sheet.cssRules]
      .map((rule) => rule.cssText)
      .join("\n");
    frameDocument.head.appendChild(style);
  }

  const printStyles = frameDocument.createElement("style");
  printStyles.textContent = PRINT_STYLES;
  frameDocument.head.appendChild(printStyles);
}

async function waitForAssets(
  frameWindow: Window,
  frameDocument: Document,
): Promise<void> {
  const pending: Promise<unknown>[] = [];

  for (const link of frameDocument.querySelectorAll<HTMLLinkElement>(
    'link[rel="stylesheet"]',
  )) {
    if (link.sheet) continue;
    pending.push(settledEvent(link));
  }

  for (const image of frameDocument.images) {
    if (image.complete) continue;
    pending.push(settledEvent(image));
  }

  if (frameDocument.fonts?.ready) {
    pending.push(frameDocument.fonts.ready);
  }

  if (pending.length === 0) return;

  // A stylesheet or image that never resolves must not strand the reader with a
  // dialog that never opens.
  await Promise.race([
    Promise.all(pending),
    new Promise((resolve) => frameWindow.setTimeout(resolve, ASSET_TIMEOUT_MS)),
  ]);
}

function settledEvent(target: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    target.addEventListener("load", () => resolve(), { once: true });
    target.addEventListener("error", () => resolve(), { once: true });
  });
}

function scheduleCleanup(iframe: HTMLIFrameElement): void {
  let isRemoved = false;

  const remove = () => {
    if (isRemoved) return;
    isRemoved = true;
    iframe.remove();
  };

  iframe.contentWindow?.addEventListener("afterprint", remove, { once: true });
  // Safari never fires `afterprint` on a frame, and a cancelled dialog can skip
  // it too, so the frame also expires on its own.
  window.setTimeout(remove, CLEANUP_TIMEOUT_MS);
}
