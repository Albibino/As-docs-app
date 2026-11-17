import {
  DEFAULT_PDF_EXPORT_THEME,
  normalizePdfExportTheme,
} from './pdf-export-theme';

describe('normalizePdfExportTheme', () => {
  it('uses the Soeltech defaults when no theme is configured', () => {
    expect(normalizePdfExportTheme(undefined)).toEqual(
      DEFAULT_PDF_EXPORT_THEME,
    );
  });

  it('merges valid workspace settings without dropping defaults', () => {
    const theme = normalizePdfExportTheme({
      colors: { primary: '#123456' },
      page: { margins: { left: 35 } },
      cover: { enabled: false },
    });

    expect(theme.colors.primary).toBe('#123456');
    expect(theme.colors.secondary).toBe(
      DEFAULT_PDF_EXPORT_THEME.colors.secondary,
    );
    expect(theme.page.margins.left).toBe(35);
    expect(theme.page.margins.top).toBe(
      DEFAULT_PDF_EXPORT_THEME.page.margins.top,
    );
    expect(theme.cover.enabled).toBe(false);
  });

  it('falls back when values are outside the supported range', () => {
    const theme = normalizePdfExportTheme({
      page: {
        size: 'LETTER',
        fontSize: 0,
        lineHeight: 9,
        margins: { left: -10 },
      },
      colors: { primary: 'red' },
      title: { alignment: 'justify' },
    });

    expect(theme.page.size).toBe(DEFAULT_PDF_EXPORT_THEME.page.size);
    expect(theme.page.fontSize).toBe(DEFAULT_PDF_EXPORT_THEME.page.fontSize);
    expect(theme.page.lineHeight).toBe(
      DEFAULT_PDF_EXPORT_THEME.page.lineHeight,
    );
    expect(theme.page.margins.left).toBe(
      DEFAULT_PDF_EXPORT_THEME.page.margins.left,
    );
    expect(theme.colors.primary).toBe(DEFAULT_PDF_EXPORT_THEME.colors.primary);
    expect(theme.title.alignment).toBe(
      DEFAULT_PDF_EXPORT_THEME.title.alignment,
    );
  });

  it('accepts themes persisted as JSON strings', () => {
    const theme = normalizePdfExportTheme(
      JSON.stringify({ title: { fontSize: 27 } }),
    );

    expect(theme.title.fontSize).toBe(27);
    expect(theme.page.fontSize).toBe(DEFAULT_PDF_EXPORT_THEME.page.fontSize);
  });

  it('preserves only valid workspace-scoped image asset identifiers', () => {
    const theme = normalizePdfExportTheme({
      cover: { backgroundAssetId: '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png' },
      page: { backgroundAssetId: '../other-workspace/private.png' },
    });

    expect(theme.cover.backgroundAssetId).toBe(
      '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
    );
    expect(theme.page.backgroundAssetId).toBeNull();
  });

  it('normalizes one full-page content background without enabling legacy furniture', () => {
    const theme = normalizePdfExportTheme({
      page: {
        backgroundAsset: 'https://cdn.example.com/page-background.png',
        backgroundAssetId: '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
      },
    });

    expect((theme.page as Record<string, unknown>).backgroundAsset).toBe(
      'https://cdn.example.com/page-background.png',
    );
    expect((theme.page as Record<string, unknown>).backgroundAssetId).toBe(
      '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
    );
    expect((theme as unknown as Record<string, unknown>).decoration).toBeUndefined();
    expect(theme.footer).toEqual({ showPageNumber: false });
  });
});
