import {
  buildFolderImportManifest,
  classifyFolderImportEntry,
  normalizeFolderImportPath,
} from './folder-import-manifest';
import { FolderImportEntryKind } from '../dto/folder-import.dto';

describe('folder import manifest', () => {
  describe('classifyFolderImportEntry', () => {
    it.each([
      ['comunicado.docx', FolderImportEntryKind.Document],
      ['pagina.HTML', FolderImportEntryKind.Document],
      ['notas.md', FolderImportEntryKind.Document],
      ['calendario.pdf', FolderImportEntryKind.Pdf],
      ['foto.jpg', FolderImportEntryKind.Image],
      ['arte.PNG', FolderImportEntryKind.Image],
      ['original.heic', FolderImportEntryKind.Image],
      ['evento.mp4', FolderImportEntryKind.Video],
      ['planilha.xlsx', FolderImportEntryKind.Attachment],
    ])('classifies %s as %s', (fileName, expectedKind) => {
      expect(classifyFolderImportEntry(fileName)).toBe(expectedKind);
    });

    it.each(['.DS_Store', 'Thumbs.db', '~$rascunho.docx'])(
      'ignores operating system or temporary file %s',
      (fileName) => {
        expect(classifyFolderImportEntry(fileName)).toBe(
          FolderImportEntryKind.Ignored,
        );
      },
    );
  });

  describe('normalizeFolderImportPath', () => {
    it('normalizes separators and unicode to NFC', () => {
      expect(normalizeFolderImportPath('Eventos\\Ma\u0303es\\foto.jpg')).toBe(
        'Eventos/Mães/foto.jpg',
      );
    });

    it.each([
      '../segredo.txt',
      'eventos/../../segredo.txt',
      '/etc/passwd',
      'C:\\Windows\\secret.txt',
      'eventos/./foto.jpg',
      'eventos//foto.jpg',
      'eventos/\0foto.jpg',
    ])('rejects unsafe path %s', (relativePath) => {
      expect(() => normalizeFolderImportPath(relativePath)).toThrow(
        'Invalid folder import path',
      );
    });
  });

  describe('buildFolderImportManifest', () => {
    it('builds deterministic directories and reconciles ignored and duplicate bytes', () => {
      const duplicateHash = 'a'.repeat(64);
      const manifest = buildFolderImportManifest([
        {
          relativePath: 'Eventos 2025/12 - Natal/Fotos/video.mp4',
          fileSize: 1_000,
          mimeType: 'video/mp4',
          sha256: duplicateHash,
        },
        {
          relativePath: 'Eventos 2025/12 - Natal/Fotos/video (1).mp4',
          fileSize: 1_000,
          mimeType: 'video/mp4',
          sha256: duplicateHash,
        },
        {
          relativePath: 'Eventos 2025/03 - Mulheres/Documento.docx',
          fileSize: 250,
          sha256: 'b'.repeat(64),
        },
        {
          relativePath: 'Eventos 2025/.DS_Store',
          fileSize: 20,
        },
      ]);

      expect(manifest.directories).toEqual([
        'Eventos 2025',
        'Eventos 2025/03 - Mulheres',
        'Eventos 2025/12 - Natal',
        'Eventos 2025/12 - Natal/Fotos',
      ]);
      expect(manifest.entries[1].duplicateOfPath).toBe(
        'Eventos 2025/12 - Natal/Fotos/video.mp4',
      );
      expect(manifest.summary).toEqual({
        totalEntries: 4,
        importableEntries: 3,
        ignoredEntries: 1,
        duplicateEntries: 1,
        totalBytes: 2_270,
        effectiveBytes: 1_250,
        duplicateBytes: 1_000,
        ignoredBytes: 20,
      });
    });

    it('rejects duplicate normalized paths', () => {
      expect(() =>
        buildFolderImportManifest([
          {
            relativePath: 'Ma\u0303es/foto.jpg',
            fileSize: 10,
            sha256: 'a'.repeat(64),
          },
          {
            relativePath: 'Mães/foto.jpg',
            fileSize: 10,
            sha256: 'b'.repeat(64),
          },
        ]),
      ).toThrow('Duplicate folder import path');
    });

    it('rejects malformed hashes and negative file sizes', () => {
      expect(() =>
        buildFolderImportManifest([
          { relativePath: 'foto.jpg', fileSize: -1, sha256: 'invalid' },
        ]),
      ).toThrow('Invalid folder import file size');

      expect(() =>
        buildFolderImportManifest([
          { relativePath: 'foto.jpg', fileSize: 1, sha256: 'invalid' },
        ]),
      ).toThrow('Invalid folder import SHA-256');
    });
  });
});
