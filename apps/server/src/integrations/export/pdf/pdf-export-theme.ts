export const PDF_EXPORT_FONT_FAMILIES = [
  'Arial',
  'Calibri',
  'Georgia',
  'Helvetica',
  'Times New Roman',
  'Verdana',
] as const;

export type PdfExportFontFamily = (typeof PDF_EXPORT_FONT_FAMILIES)[number];
export type PdfExportAlignment = 'left' | 'center' | 'right';

export interface PdfExportTheme {
  page: {
    size: 'A4';
    margins: {
      top: number;
      right: number;
      bottom: number;
      left: number;
    };
    fontFamily: PdfExportFontFamily;
    fontSize: number;
    lineHeight: number;
    backgroundAsset: string | null;
    backgroundAssetId: string | null;
    backgroundAssetName?: string;
  };
  colors: {
    primary: string;
    secondary: string;
    text: string;
    coverBackground: string;
    coverText: string;
    tableHeaderBackground: string;
    tableHeaderText: string;
  };
  title: {
    fontSize: number;
    uppercase: boolean;
    color: string;
    alignment: PdfExportAlignment;
  };
  headings: {
    fontSize: number;
    uppercase: boolean;
    color: string;
  };
  cover: {
    enabled: boolean;
    backgroundAsset: string | null;
    backgroundAssetId: string | null;
    backgroundAssetName?: string;
  };
  footer: {
    showPageNumber: boolean;
  };
}

export const DEFAULT_PDF_EXPORT_THEME: PdfExportTheme = {
  page: {
    size: 'A4',
    margins: { top: 25, right: 25, bottom: 25, left: 30 },
    fontFamily: 'Calibri',
    fontSize: 12,
    lineHeight: 1.15,
    backgroundAsset: null,
    backgroundAssetId: null,
  },
  colors: {
    primary: '#00A8B5',
    secondary: '#6F6F6F',
    text: '#000000',
    coverBackground: '#FFFFFF',
    coverText: '#000000',
    tableHeaderBackground: '#00A8B5',
    tableHeaderText: '#FFFFFF',
  },
  title: {
    fontSize: 26,
    uppercase: true,
    color: '#000000',
    alignment: 'left',
  },
  headings: {
    fontSize: 14,
    uppercase: true,
    color: '#00A8B5',
  },
  cover: {
    enabled: true,
    backgroundAsset: null,
    backgroundAssetId: null,
  },
  footer: {
    showPageNumber: false,
  },
};

export function normalizePdfExportTheme(input: unknown): PdfExportTheme {
  const source = asRecord(input);
  const page = asRecord(source.page);
  const margins = asRecord(page.margins);
  const colors = asRecord(source.colors);
  const title = asRecord(source.title);
  const headings = asRecord(source.headings);
  const cover = asRecord(source.cover);
  const footer = asRecord(source.footer);
  const pageBackgroundAssetId = pdfExportAssetIdValue(page.backgroundAssetId);
  const coverBackgroundAssetId = pdfExportAssetIdValue(cover.backgroundAssetId);
  const pageBackgroundAssetName = pageBackgroundAssetId
    ? assetNameValue(page.backgroundAssetName)
    : undefined;
  const coverBackgroundAssetName = coverBackgroundAssetId
    ? assetNameValue(cover.backgroundAssetName)
    : undefined;

  return {
    page: {
      size: 'A4',
      margins: {
        top: numberInRange(margins.top, 0, 60, DEFAULT_PDF_EXPORT_THEME.page.margins.top),
        right: numberInRange(margins.right, 0, 60, DEFAULT_PDF_EXPORT_THEME.page.margins.right),
        bottom: numberInRange(margins.bottom, 0, 60, DEFAULT_PDF_EXPORT_THEME.page.margins.bottom),
        left: numberInRange(margins.left, 0, 60, DEFAULT_PDF_EXPORT_THEME.page.margins.left),
      },
      fontFamily: enumValue(
        page.fontFamily,
        PDF_EXPORT_FONT_FAMILIES,
        DEFAULT_PDF_EXPORT_THEME.page.fontFamily,
      ),
      fontSize: numberInRange(page.fontSize, 8, 24, DEFAULT_PDF_EXPORT_THEME.page.fontSize),
      lineHeight: numberInRange(page.lineHeight, 1, 2, DEFAULT_PDF_EXPORT_THEME.page.lineHeight),
      backgroundAsset: stringValue(page.backgroundAsset),
      backgroundAssetId: pageBackgroundAssetId,
      ...(pageBackgroundAssetName
        ? { backgroundAssetName: pageBackgroundAssetName }
        : {}),
    },
    colors: {
      primary: colorValue(colors.primary, DEFAULT_PDF_EXPORT_THEME.colors.primary),
      secondary: colorValue(colors.secondary, DEFAULT_PDF_EXPORT_THEME.colors.secondary),
      text: colorValue(colors.text, DEFAULT_PDF_EXPORT_THEME.colors.text),
      coverBackground: colorValue(
        colors.coverBackground,
        DEFAULT_PDF_EXPORT_THEME.colors.coverBackground,
      ),
      coverText: colorValue(colors.coverText, DEFAULT_PDF_EXPORT_THEME.colors.coverText),
      tableHeaderBackground: colorValue(
        colors.tableHeaderBackground,
        DEFAULT_PDF_EXPORT_THEME.colors.tableHeaderBackground,
      ),
      tableHeaderText: colorValue(
        colors.tableHeaderText,
        DEFAULT_PDF_EXPORT_THEME.colors.tableHeaderText,
      ),
    },
    title: {
      fontSize: numberInRange(title.fontSize, 12, 48, DEFAULT_PDF_EXPORT_THEME.title.fontSize),
      uppercase: booleanValue(title.uppercase, DEFAULT_PDF_EXPORT_THEME.title.uppercase),
      color: colorValue(title.color, DEFAULT_PDF_EXPORT_THEME.title.color),
      alignment: enumValue(
        title.alignment,
        ['left', 'center', 'right'] as const,
        DEFAULT_PDF_EXPORT_THEME.title.alignment,
      ),
    },
    headings: {
      fontSize: numberInRange(
        headings.fontSize,
        8,
        36,
        DEFAULT_PDF_EXPORT_THEME.headings.fontSize,
      ),
      uppercase: booleanValue(
        headings.uppercase,
        DEFAULT_PDF_EXPORT_THEME.headings.uppercase,
      ),
      color: colorValue(headings.color, DEFAULT_PDF_EXPORT_THEME.headings.color),
    },
    cover: {
      enabled: booleanValue(cover.enabled, DEFAULT_PDF_EXPORT_THEME.cover.enabled),
      backgroundAsset: stringValue(cover.backgroundAsset),
      backgroundAssetId: coverBackgroundAssetId,
      ...(coverBackgroundAssetName
        ? { backgroundAssetName: coverBackgroundAssetName }
        : {}),
    },
    footer: {
      showPageNumber: booleanValue(
        footer.showPageNumber,
        DEFAULT_PDF_EXPORT_THEME.footer.showPageNumber,
      ),
    },
  };
}

function pdfExportAssetIdValue(value: unknown): string | null {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g)$/i.test(
      value,
    )
    ? value
    : null;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value === 'string') {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return {};
    }
  }

  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function numberInRange(
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
    ? value
    : fallback;
}

function booleanValue(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function assetNameValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, 255)
    : undefined;
}

function colorValue(value: unknown, fallback: string): string {
  return typeof value === 'string' && /^#[0-9a-f]{3}(?:[0-9a-f]{3})?$/i.test(value)
    ? value
    : fallback;
}

function enumValue<T extends string>(
  value: unknown,
  values: readonly T[],
  fallback: T,
): T {
  return typeof value === 'string' && values.includes(value as T)
    ? (value as T)
    : fallback;
}
