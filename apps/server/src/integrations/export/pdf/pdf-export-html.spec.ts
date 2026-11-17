import {
  DEFAULT_PDF_EXPORT_THEME,
  normalizePdfExportTheme,
} from './pdf-export-theme';
import {
  buildPdfExportFooterTemplate,
  buildPdfExportHtml,
} from './pdf-export-html';

describe('buildPdfExportHtml', () => {
  it('builds a document with an independent cover and one full-page background', () => {
    const html = buildPdfExportHtml({
      title: 'Manual <interno>',
      bodyHtml: '<h1>Seção</h1><p>Conteúdo</p>',
      logoUrl: '/workspace-logo.png',
      theme: normalizePdfExportTheme({
        page: { backgroundAsset: 'https://example.com/page-background.png' },
        cover: { backgroundAsset: 'https://example.com/cover.jpg' },
      }),
    });

    expect(html).toContain('<section class="pdf-cover pdf-page-cover"');
    expect(html).toContain('Manual &lt;interno&gt;');
    expect(html).toContain('class="pdf-logo" src="/workspace-logo.png"');
    expect(html).toContain(
      'class="pdf-page-background" src="https://example.com/page-background.png"',
    );
    expect(html).toContain(
      "background-image: url('https://example.com/cover.jpg')",
    );
    expect(html).not.toContain('pdf-document-masthead');
    expect(html).not.toContain('pdf-document-decoration');
    expect(html).not.toContain('pdf-document-footer');
    expect(html).not.toContain('data:image/');
    expect(html).toContain('Seção');
    expect(html).toContain('@page {');
    expect(html).toContain('size: A4;');
    expect(html).toContain('font-family: "Calibri"');
  });

  it('does not render Solutech visual fallbacks when no custom assets are configured', () => {
    const html = buildPdfExportHtml({
      title: 'Manual operacional',
      bodyHtml: '<h2>Introdução</h2><p>Conteúdo</p>',
      theme: DEFAULT_PDF_EXPORT_THEME,
    });

    expect(html).toContain('class="pdf-cover pdf-page-cover"');
    expect(html).not.toContain('class="pdf-logo"');
    expect(html).not.toContain('class="pdf-page-background"');
    expect(html).not.toContain('pdf-document-masthead');
    expect(html).not.toContain('pdf-document-decoration');
    expect(html).not.toContain('pdf-document-footer');
    expect(html).not.toContain('data:image/');
  });

  it('omits the cover while keeping content available without a background image', () => {
    const html = buildPdfExportHtml({
      title: 'Manual',
      bodyHtml: '<p>Conteúdo</p>',
      theme: normalizePdfExportTheme({ cover: { enabled: false } }),
    });

    expect(html).not.toContain('class="pdf-cover"');
    expect(html).not.toContain('class="pdf-page-background"');
    expect(html).toContain('Conteúdo');
    expect(html).toMatch(/\.pdf-content \{[\s\S]*?background: transparent;/);
    expect(html).toMatch(
      /\.pdf-page-table > tbody > tr > td \{[\s\S]*?background: transparent;/,
    );
  });

  it('keeps the full-page image fixed behind readable content', () => {
    const html = buildPdfExportHtml({
      title: 'Manual',
      bodyHtml: '<p>Conteúdo legível</p>',
      theme: normalizePdfExportTheme({
        page: { backgroundAsset: 'https://example.com/page.png' },
      }),
    });

    expect(html).toMatch(
      /\.pdf-page-background \{[\s\S]*?position: fixed;[\s\S]*?z-index: 0;/,
    );
    expect(html).toMatch(
      /\.pdf-content \{[\s\S]*?position: relative;[\s\S]*?z-index: 10;/,
    );
    expect(html).toContain('height: 100%;');
    expect(html).toContain('object-fit: fill;');
  });

  it('uses the Chromium template only for optional page numbers', () => {
    const html = buildPdfExportHtml({
      title: 'Manual',
      bodyHtml: '<p>Conteúdo</p>',
      theme: DEFAULT_PDF_EXPORT_THEME,
    });

    expect(html).not.toContain('Rodapé personalizado');
    expect(buildPdfExportFooterTemplate(DEFAULT_PDF_EXPORT_THEME)).toBeUndefined();

    const numberedTheme = normalizePdfExportTheme({
      footer: { showPageNumber: true },
    });
    const template = buildPdfExportFooterTemplate(numberedTheme);

    expect(template).toContain('class="pageNumber"');
    expect(template).not.toContain('pdf-document-footer');
  });

  it('keeps the cover locked to the full A4 page', () => {
    const html = buildPdfExportHtml({
      title: 'Manual',
      bodyHtml: '<p>Conteúdo</p>',
      theme: DEFAULT_PDF_EXPORT_THEME,
    });

    expect(html).toContain('height: 100vh;');
    expect(html).toContain('max-height: 100vh;');
    expect(html).toContain('z-index: 100;');
  });

  it('prepares Mermaid source blocks for browser rendering and preserves fallback source', () => {
    const html = buildPdfExportHtml({
      title: 'Manual',
      bodyHtml:
        '<pre><code class="language-mermaid">flowchart LR\nA--&gt;B</code></pre>',
      theme: DEFAULT_PDF_EXPORT_THEME,
    });

    expect(html).toContain('data-pdf-mermaid="true"');
    expect(html).toContain('window.__pdfMermaidReady');
    expect(html).toContain('code.closest(\'pre\')?.replaceWith');
    expect(html).toContain('flowchart LR');
  });
});
