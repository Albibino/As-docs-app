import { PdfExportRenderer } from './pdf-export-renderer';

describe('PdfExportRenderer', () => {
  it('renders themed HTML as an A4 PDF and closes browser resources', async () => {
    const page = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const launch = jest.fn().mockResolvedValue(browser);
    const renderer = new PdfExportRenderer(launch);

    const result = await renderer.render('<html>PDF</html>');

    expect(result).toEqual(Buffer.from('%PDF-test'));
    expect(launch).toHaveBeenCalledTimes(1);
    expect(page.setContent).toHaveBeenCalledWith('<html>PDF</html>', {
      waitUntil: 'networkidle',
    });
    expect(page.pdf).toHaveBeenCalledWith({
      format: 'A4',
      printBackground: true,
      preferCSSPageSize: true,
    });
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('closes resources when PDF rendering fails', async () => {
    const page = {
      setContent: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockRejectedValue(new Error('render failed')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const renderer = new PdfExportRenderer(jest.fn().mockResolvedValue(browser));

    await expect(renderer.render('<html>PDF</html>')).rejects.toThrow(
      'render failed',
    );
    expect(page.close).toHaveBeenCalledTimes(1);
    expect(browser.close).toHaveBeenCalledTimes(1);
  });

  it('waits for Mermaid diagrams before creating the PDF', async () => {
    const page = {
      setContent: jest.fn().mockResolvedValue(undefined),
      waitForFunction: jest.fn().mockResolvedValue(undefined),
      pdf: jest.fn().mockResolvedValue(Buffer.from('%PDF-test')),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const browser = {
      newPage: jest.fn().mockResolvedValue(page),
      close: jest.fn().mockResolvedValue(undefined),
    };
    const renderer = new PdfExportRenderer(
      jest.fn().mockResolvedValue(browser),
    );

    await renderer.render(
      '<body data-pdf-mermaid="true">PDF</body>',
    );

    expect(page.waitForFunction).toHaveBeenCalledWith(
      'window.__pdfMermaidReady === true',
      { timeout: 10000 },
    );
    expect(page.pdf).toHaveBeenCalled();
  });
});
