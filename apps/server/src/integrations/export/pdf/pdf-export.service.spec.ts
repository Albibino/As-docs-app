import { DEFAULT_PDF_EXPORT_THEME } from './pdf-export-theme';
import { PdfExportService } from './pdf-export.service';
import { PdfExportRenderer } from './pdf-export-renderer';

describe('PdfExportService', () => {
  it('renders a document using the configured theme and HTML content', async () => {
    const render = jest.fn().mockResolvedValue(Buffer.from('%PDF-test'));
    const theme = {
      ...DEFAULT_PDF_EXPORT_THEME,
      footer: { ...DEFAULT_PDF_EXPORT_THEME.footer, showPageNumber: true },
    };
    const renderer = {
      render,
    } as unknown as PdfExportRenderer;
    const service = new PdfExportService(renderer);

    const result = await service.render({
      title: 'Documento',
      bodyHtml: '<p>Conteúdo</p>',
      theme,
      logoUrl: 'data:image/png;base64,logo',
    });

    expect(result).toEqual(Buffer.from('%PDF-test'));
    expect(render.mock.calls[0][0]).toContain(
      'data:image/png;base64,logo',
    );
    expect(render.mock.calls[0][0]).toContain('<p>Conteúdo</p>');
    expect(render.mock.calls[0][1].footerTemplate).toBeTruthy();
  });
});
