import { BadRequestException } from '@nestjs/common';
import { StorageService } from '../../storage/storage.service';
import { PdfExportAssetsService } from './pdf-export-assets.service';
import { normalizePdfExportTheme } from './pdf-export-theme';

describe('PdfExportAssetsService', () => {
  const storage = {
    upload: jest.fn(),
    read: jest.fn(),
    delete: jest.fn(),
  };
  let service: PdfExportAssetsService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new PdfExportAssetsService(storage as unknown as StorageService);
  });

  it('stores PNG uploads under the active workspace and returns a generated asset ID', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    const file = {
      filename: 'brand.png',
      mimetype: 'image/png',
      toBuffer: jest.fn().mockResolvedValue(png),
    };

    const result = await service.upload(file as never, 'workspace-1');

    expect(result.assetId).toMatch(/^[0-9a-f-]{36}\.png$/i);
    expect(storage.upload).toHaveBeenCalledWith(
      `workspace-1/pdf-export-assets/${result.assetId}`,
      png,
    );
  });

  it('rejects files that are not supported raster images', async () => {
    const file = {
      filename: 'brand.svg',
      mimetype: 'image/svg+xml',
      toBuffer: jest.fn().mockResolvedValue(Buffer.from('<svg />')),
    };

    await expect(service.upload(file as never, 'workspace-1')).rejects.toThrow(
      BadRequestException,
    );
    expect(storage.upload).not.toHaveBeenCalled();
  });

  it('embeds an image only from the requested workspace asset namespace', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    storage.read.mockResolvedValue(png);

    await expect(
      service.toDataUri('workspace-1', '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png'),
    ).resolves.toBe(`data:image/png;base64,${png.toString('base64')}`);
    await expect(
      service.toDataUri('workspace-1', '../workspace-2/private.png'),
    ).resolves.toBeUndefined();
    expect(storage.read).toHaveBeenCalledTimes(1);
    expect(storage.read).toHaveBeenCalledWith(
      'workspace-1/pdf-export-assets/3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
    );
  });

  it('prefers uploaded images and keeps direct URLs as a fallback', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    storage.read.mockResolvedValueOnce(png).mockRejectedValueOnce(new Error());
    const theme = normalizePdfExportTheme({
      cover: {
        backgroundAsset: 'https://cdn.example.com/cover.jpg',
        backgroundAssetId: '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
      },
      page: {
        backgroundAsset: 'https://cdn.example.com/page-background.png',
        backgroundAssetId: '755a4f96-2e8e-4e31-9c88-2cf836b9ba1e.jpg',
      },
    });

    const resolved = await service.resolveThemeAssets('workspace-1', theme);

    expect(resolved.cover.backgroundAsset).toBe(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(resolved.page.backgroundAsset).toBe(
      'https://cdn.example.com/page-background.png',
    );
    expect(resolved.cover.backgroundAssetId).toBe(
      '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
    );
  });

  it('resolves the uploaded full-page background in the active workspace', async () => {
    const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10, 0]);
    storage.read.mockResolvedValue(png);
    const theme = normalizePdfExportTheme({
      page: {
        backgroundAsset: 'https://cdn.example.com/page-background.png',
        backgroundAssetId: '3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
      },
    });

    const resolved = await service.resolveThemeAssets('workspace-1', theme);

    expect((resolved.page as Record<string, unknown>).backgroundAsset).toBe(
      `data:image/png;base64,${png.toString('base64')}`,
    );
    expect(storage.read).toHaveBeenCalledWith(
      'workspace-1/pdf-export-assets/3f5048a2-3883-4da3-87e7-a841f5c3f89a.png',
    );
  });

  it('deletes only generated image asset IDs from the active workspace', async () => {
    const assetId = '3f5048a2-3883-4da3-87e7-a841f5c3f89a.jpg';

    await service.remove('workspace-1', assetId);

    expect(storage.delete).toHaveBeenCalledWith(
      `workspace-1/pdf-export-assets/${assetId}`,
    );
    await expect(service.remove('workspace-1', '../other.png')).rejects.toThrow(
      BadRequestException,
    );
  });
});
