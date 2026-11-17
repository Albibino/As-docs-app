import { PdfExportTheme } from './pdf-export-theme';
import {
  buildPdfMermaidScript,
  hasPdfMermaidBlocks,
} from './pdf-export-mermaid';

export interface PdfExportHtmlInput {
  title: string;
  bodyHtml: string;
  theme: PdfExportTheme;
  logoUrl?: string;
}

export function buildPdfExportHtml({
  title,
  bodyHtml,
  theme,
  logoUrl,
}: PdfExportHtmlInput): string {
  const safeLogoUrl = safeAssetUrl(logoUrl);
  const safeCoverAsset = safeAssetUrl(theme.cover.backgroundAsset);
  const safePageBackgroundAsset = safeAssetUrl(theme.page.backgroundAsset);
  const hasMermaid = hasPdfMermaidBlocks(bodyHtml);
  const mermaidScript = buildPdfMermaidScript(bodyHtml);
  const coverStyle = safeCoverAsset
    ? ` style="background-image: url('${escapeAttribute(safeCoverAsset)}')"`
    : '';
  const coverLogo = safeLogoUrl
    ? `<img class="pdf-logo" src="${escapeAttribute(safeLogoUrl)}" alt="" />`
    : '';
  const pageBackground = safePageBackgroundAsset
    ? `<img class="pdf-page-background" src="${escapeAttribute(safePageBackgroundAsset)}" alt="" />`
    : '';
  const cover = theme.cover.enabled
    ? `<section class="pdf-cover pdf-page-cover"${coverStyle}>
        ${coverLogo}
        <h1>${escapeText(title, theme.title.uppercase)}</h1>
      </section>`
    : '';

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <title>${escapeText(title)}</title>
    <style>${buildPdfExportCss(theme)}</style>
  </head>
  <body${hasMermaid ? ' data-pdf-mermaid="true"' : ''}>
    ${cover}
    ${pageBackground}
    <main class="pdf-content">
      <table class="pdf-page-table">
        <tbody>
          <tr><td>
            <h1 class="pdf-document-title">${escapeText(title, theme.title.uppercase)}</h1>
            ${bodyHtml}
          </td></tr>
        </tbody>
      </table>
    </main>
    ${mermaidScript}
    <script>
      for (const image of document.querySelectorAll('.pdf-page-background, .pdf-cover img, .pdf-content img')) {
        if (image.complete) {
          if (!image.naturalWidth) image.remove();
        } else {
          image.addEventListener('error', () => image.remove(), { once: true });
        }
      }
    </script>
  </body>
</html>`;
}

export function buildPdfExportFooterTemplate(
  theme: PdfExportTheme,
): string | undefined {
  if (!theme.footer.showPageNumber) return undefined;

  return `<div style="color:${theme.colors.secondary};font-family:${escapeAttribute(
    theme.page.fontFamily,
  )},sans-serif;font-size:8pt;margin:0 25mm 0 30mm;transform:translateY(-8mm);width:100%;text-align:right;">
    <span class="pageNumber"></span>
  </div>`;
}

function buildPdfExportCss(theme: PdfExportTheme): string {
  const page = theme.page;
  const colors = theme.colors;
  const title = theme.title;
  const headings = theme.headings;

  return `
@page {
  size: ${page.size};
  margin: 0;
}

:root {
  --pdf-primary: ${colors.primary};
  --pdf-secondary: ${colors.secondary};
  --pdf-text: ${colors.text};
  --pdf-cover-background: ${colors.coverBackground};
  --pdf-cover-text: ${colors.coverText};
  --pdf-table-header-background: ${colors.tableHeaderBackground};
  --pdf-table-header-text: ${colors.tableHeaderText};
}

html, body {
  margin: 0;
  padding: 0;
  background: #fff;
}

body {
  color: var(--pdf-text);
  font-family: "${escapeCssString(page.fontFamily)}", sans-serif;
  font-size: ${page.fontSize}pt;
  line-height: ${page.lineHeight};
}

.pdf-content {
  background: transparent;
  box-sizing: border-box;
  min-height: 297mm;
  padding: ${page.margins.top}mm ${page.margins.right}mm ${Math.max(
    page.margins.bottom,
    24,
  )}mm ${page.margins.left}mm;
  position: relative;
  z-index: 10;
}

.pdf-page-table {
  border-collapse: collapse;
  border-spacing: 0;
  width: 100%;
}

.pdf-page-table td {
  border: 0;
  padding: 0;
}

.pdf-cover {
  background-color: var(--pdf-cover-background);
  background-position: center;
  background-repeat: no-repeat;
  background-size: cover;
  break-after: page;
  box-sizing: border-box;
  color: var(--pdf-cover-text);
  height: 100vh;
  max-height: 100vh;
  min-height: 100vh;
  overflow: hidden;
  position: relative;
  width: 100%;
  z-index: 100;
}

.pdf-cover > * {
  position: absolute;
  z-index: 1;
}

.pdf-logo {
  bottom: 66mm;
  display: block;
  height: 24mm;
  left: 20mm;
  object-fit: contain;
  object-position: left center;
  width: 82mm;
}

.pdf-cover h1 {
  bottom: 37mm;
  color: ${title.color};
  font-size: ${title.fontSize}pt;
  font-weight: 700;
  left: 20mm;
  margin: 0;
  right: 20mm;
  text-align: ${title.alignment};
  text-transform: ${title.uppercase ? 'uppercase' : 'none'};
}

.pdf-page-background {
  height: 100%;
  inset: 0;
  object-fit: fill;
  pointer-events: none;
  position: fixed;
  width: 100%;
  z-index: 0;
}

.pdf-document-title {
  break-after: avoid;
  color: ${colors.primary};
  font-size: ${headings.fontSize}pt;
  font-weight: 700;
  margin: 0 0 10mm;
  text-align: center;
  text-transform: ${title.uppercase ? 'uppercase' : 'none'};
}

.pdf-content h1,
.pdf-content h2,
.pdf-content h3,
.pdf-content h4,
.pdf-content h5,
.pdf-content h6 {
  break-after: avoid;
  break-inside: avoid;
  color: ${headings.color};
  font-size: ${headings.fontSize}pt;
  font-weight: 700;
  line-height: 1.15;
  margin: 6mm 0 3mm;
  text-transform: ${headings.uppercase ? 'uppercase' : 'none'};
}

.pdf-document-title + h1,
.pdf-document-title + h2,
.pdf-document-title + h3,
.pdf-document-title + p {
  margin-top: 0;
}

.pdf-content p {
  margin: 0 0 3mm;
  orphans: 3;
  widows: 3;
}

.pdf-content ul,
.pdf-content ol {
  margin: 0 0 3.5mm;
  padding-left: 7mm;
}

.pdf-content li {
  margin: 0 0 1.5mm;
  orphans: 2;
  widows: 2;
}

.pdf-content blockquote,
.pdf-content pre,
.pdf-content figure {
  break-inside: avoid;
  margin: 4mm 0;
}

.pdf-content a {
  color: var(--pdf-primary);
}

.pdf-content img,
.pdf-content video {
  break-inside: avoid;
  display: block;
  height: auto;
  margin: 4mm auto;
  max-height: 180mm;
  max-width: 100%;
  object-fit: contain;
}

.pdf-content table {
  border-collapse: collapse;
  margin: 5mm 0;
  table-layout: auto !important;
  width: 100% !important;
}

.pdf-content tr {
  break-inside: avoid;
}

.pdf-content th,
.pdf-content td {
  border: .25mm solid var(--pdf-primary);
  padding: 2mm;
  vertical-align: top;
  width: auto !important;
}

.pdf-content th {
  background: var(--pdf-table-header-background);
  color: var(--pdf-table-header-text);
  font-weight: 700;
}

.pdf-page-table {
  margin: 0;
  table-layout: auto;
  width: 100%;
}

.pdf-page-table > tbody > tr > td {
  border: 0;
  background: transparent;
  padding: 0;
}

.pdf-page-table > tbody > tr > td {
  position: relative;
  z-index: 1;
}

.pdf-mermaid {
  break-inside: avoid;
  margin: 4mm 0;
  max-width: 100%;
  overflow: hidden;
  text-align: center;
}

.pdf-mermaid svg {
  display: block;
  height: auto;
  margin: 0 auto;
  max-height: 180mm;
  max-width: 100%;
}

/* Keep the cover opaque above repeated page furniture on the first page. */
.pdf-page-cover {
  background-color: var(--pdf-cover-background);
}

`;
}

function escapeText(value: string, uppercase = false): string {
  const text = uppercase ? value.toLocaleUpperCase('pt-BR') : value;
  return text.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    };
    return entities[character];
  });
}

function escapeAttribute(value: string): string {
  return escapeText(value);
}

function escapeCssString(value: string): string {
  return value.replace(/[\\"\n\r]/g, '\\$&');
}

function safeAssetUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  if (
    value.startsWith('/') ||
    /^https?:\/\//i.test(value) ||
    /^data:image\/(?:png|jpe?g|svg\+xml);/i.test(value)
  ) {
    return value;
  }
  return null;
}
