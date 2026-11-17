import { Injectable, Optional } from '@nestjs/common';

export interface PdfBrowserPage {
  setContent(
    html: string,
    options: { waitUntil: 'networkidle' },
  ): Promise<void>;
  waitForFunction?(
    pageFunction: string,
    options?: { timeout?: number },
  ): Promise<void>;
  pdf(options: {
    format: 'A4';
    printBackground: boolean;
    preferCSSPageSize: boolean;
    displayHeaderFooter?: boolean;
    headerTemplate?: string;
    footerTemplate?: string;
  }): Promise<Buffer>;
  close(): Promise<void>;
}

export interface PdfBrowser {
  newPage(): Promise<PdfBrowserPage>;
  close(): Promise<void>;
}

export type PdfBrowserLauncher = () => Promise<PdfBrowser>;

@Injectable()
export class PdfExportRenderer {
  constructor(
    @Optional()
    private readonly launchBrowser: PdfBrowserLauncher = launchPlaywrightBrowser,
  ) {}

  async render(
    html: string,
    options: { footerTemplate?: string } = {},
  ): Promise<Buffer> {
    const browser = await this.launchBrowser();
    let page: PdfBrowserPage | undefined;

    try {
      page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle' });
      if (html.includes('data-pdf-mermaid="true"')) {
        await page.waitForFunction?.('window.__pdfMermaidReady === true', {
          timeout: 10000,
        });
      }
      return await page.pdf({
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        ...(options.footerTemplate
          ? {
              displayHeaderFooter: true,
              headerTemplate: '<span></span>',
              footerTemplate: options.footerTemplate,
            }
          : {}),
      });
    } finally {
      await page?.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    }
  }
}

async function launchPlaywrightBrowser(): Promise<PdfBrowser> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { chromium } = require('playwright-core') as {
    chromium: {
      launch(options?: {
        headless?: boolean;
        executablePath?: string;
      }): Promise<PdfBrowser>;
    };
  };

  const executablePath = process.env.PDF_CHROMIUM_EXECUTABLE_PATH;
  return chromium.launch({
    headless: true,
    ...(executablePath ? { executablePath } : {}),
  });
}
