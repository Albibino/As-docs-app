import {
  getDocxImportFileTitle,
  normalizeDocxImportTitle,
  removeOmittedDocxImages,
  sha256DocxImage,
  shouldOmitDocxImageHash,
} from './docx-import.utils';

describe('DOCX import utilities', () => {
  it('recognizes only the exact banner image fingerprint', () => {
    expect(
      shouldOmitDocxImageHash(
        '47e48109d026897df87f7818e9c71f8b1418459ae0ff38922eabe41f3310b558',
      ),
    ).toBe(true);
    expect(
      shouldOmitDocxImageHash(
        '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      ),
    ).toBe(false);
  });

  it('calculates a stable SHA-256 fingerprint for image bytes', () => {
    expect(sha256DocxImage(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('removes only marked banner elements from converted HTML', () => {
    const html = removeOmittedDocxImages(
      '<p><img src="" data-docx-import-omit="cover"><img src="/api/files/other.png"></p>',
    );

    expect(html).not.toContain('data-docx-import-omit');
    expect(html).toContain('/api/files/other.png');
  });

  it('removes an empty paragraph left behind by an omitted cover image', () => {
    const html = removeOmittedDocxImages(
      '<p><img src="" data-docx-import-omit="cover"></p><p>Document content</p>',
    );

    expect(html).not.toContain('<p></p>');
    expect(html).toContain('<p>Document content</p>');
  });

  it('removes a legacy .doc suffix only at the end of an imported title', () => {
    expect(normalizeDocxImportTitle('Solicitação de Compra .doc')).toBe(
      'Solicitação de Compra',
    );
    expect(normalizeDocxImportTitle('Manual.doc')).toBe('Manual');
    expect(normalizeDocxImportTitle('Consulta estrutura Multinível . doc')).toBe(
      'Consulta estrutura Multinível',
    );
    expect(normalizeDocxImportTitle('Manual doc')).toBe('Manual');
    expect(normalizeDocxImportTitle('Manual.doc . doc')).toBe('Manual');
    expect(normalizeDocxImportTitle('Manual.documentation')).toBe(
      'Manual.documentation',
    );
    expect(normalizeDocxImportTitle('Manual.docx')).toBe('Manual.docx');
    expect(getDocxImportFileTitle('Manual de compras .doc.docx')).toBe(
      'Manual de compras',
    );
    expect(getDocxImportFileTitle('Manual de compras .doc.DOCX')).toBe(
      'Manual de compras',
    );
    expect(getDocxImportFileTitle('Manual de compras doc.docx')).toBe(
      'Manual de compras',
    );
  });
});
