import { Injectable } from '@nestjs/common';
import {
  buildPdfExportFooterTemplate,
  buildPdfExportHtml,
} from './pdf-export-html';
import { PdfExportRenderer } from './pdf-export-renderer';
import { PdfExportTheme } from './pdf-export-theme';

export interface PdfExportDocumentInput {
  title: string;
  bodyHtml: string;
  theme: PdfExportTheme;
  logoUrl?: string;
}

@Injectable()
export class PdfExportService {
  constructor(
    private readonly renderer: PdfExportRenderer,
  ) {}

  async render(document: PdfExportDocumentInput): Promise<Buffer> {
    const html = buildPdfExportHtml(document);
    const footerTemplate = buildPdfExportFooterTemplate(document.theme);
    return this.renderer.render(html, { footerTemplate });
  }
}
