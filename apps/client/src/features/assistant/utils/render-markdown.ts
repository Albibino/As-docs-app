import DOMPurify from "dompurify";
import { markdownToHtml } from "@tcc-docs/editor-ext";

const PAGE_PATH = /\/s\/[^/?#]+\/p\/[^/?#]+/;

const sanitizer = DOMPurify();
sanitizer.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "A") return;
  const href = node.getAttribute("href") ?? "";

  // O modelo às vezes inventa um domínio antes do caminho da página
  // ("https://exemplo.com/s/espaco/p/slug"): fica só o caminho interno.
  const page = href.match(PAGE_PATH);
  if (page) {
    node.setAttribute("href", page[0]);
    node.removeAttribute("target");
    node.removeAttribute("rel");
    return;
  }
  if (/^https?:\/\//i.test(href)) {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer");
  }
});

/** Markdown da resposta → HTML seguro para `dangerouslySetInnerHTML`. */
export function renderAnswerHtml(markdown: string): string {
  return sanitizer.sanitize(markdownToHtml(markdown) as string, {
    ADD_ATTR: ["target", "rel"],
  });
}

/** Caminho interno de uma página (`/s/...`) se o link clicado for um. */
export function internalPageHref(href: string | null): string | null {
  return href && href.startsWith("/s/") ? href : null;
}
