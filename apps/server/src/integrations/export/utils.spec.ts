import { ExportFormat } from './dto/export-dto';
import { getExportExtension } from './utils';

describe('getExportExtension', () => {
  it('returns the PDF extension for PDF exports', () => {
    expect(getExportExtension(ExportFormat.PDF)).toBe('.pdf');
  });
});
