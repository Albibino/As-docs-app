import { BadRequestException, Injectable } from '@nestjs/common';
import { MultipartFile } from '@fastify/multipart';
import { v4 as uuid4 } from 'uuid';
import { StorageService } from '../../storage/storage.service';
import { PdfExportTheme } from './pdf-export-theme';

const PDF_EXPORT_ASSET_MAX_BYTES = 10 * 1024 * 1024;
const PDF_EXPORT_ASSET_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:png|jpe?g)$/i;

@Injectable()
export class PdfExportAssetsService {
  constructor(private readonly storageService: StorageService) {}

  async upload(file: MultipartFile, workspaceId: string): Promise<{ assetId: string }> {
    const extension = file.filename.match(/\.[^.]+$/)?.[0].toLowerCase();
    const bytes = await file.toBuffer();
    const isPng =
      extension === '.png' &&
      file.mimetype === 'image/png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
    const isJpeg =
      ['.jpg', '.jpeg'].includes(extension ?? '') &&
      file.mimetype === 'image/jpeg' &&
      bytes.length >= 3 &&
      bytes[0] === 0xff &&
      bytes[1] === 0xd8 &&
      bytes[2] === 0xff;

    if (
      bytes.length === 0 ||
      bytes.length > PDF_EXPORT_ASSET_MAX_BYTES ||
      (!isPng && !isJpeg)
    ) {
      throw new BadRequestException(
        'Use a PNG or JPEG image up to 10 MB.',
      );
    }

    const assetId = `${uuid4()}${extension}`;
    await this.storageService.upload(this.getAssetPath(workspaceId, assetId), bytes);
    return { assetId };
  }

  async remove(workspaceId: string, assetId: string): Promise<void> {
    if (!this.isValidAssetId(assetId)) {
      throw new BadRequestException('Invalid PDF export image asset.');
    }

    await this.storageService.delete(this.getAssetPath(workspaceId, assetId));
  }

  async toDataUri(
    workspaceId: string,
    assetId: string | null | undefined,
  ): Promise<string | undefined> {
    if (!assetId || !this.isValidAssetId(assetId)) return undefined;

    try {
      const image = await this.storageService.read(
        this.getAssetPath(workspaceId, assetId),
      );
      const mimeType = assetId.toLowerCase().endsWith('.png')
        ? 'image/png'
        : 'image/jpeg';
      return `data:${mimeType};base64,${image.toString('base64')}`;
    } catch {
      return undefined;
    }
  }

  async resolveThemeAssets(
    workspaceId: string,
    theme: PdfExportTheme,
  ): Promise<PdfExportTheme> {
    const [coverAsset, pageBackgroundAsset] = await Promise.all([
      this.toDataUri(workspaceId, theme.cover.backgroundAssetId),
      this.toDataUri(workspaceId, theme.page.backgroundAssetId),
    ]);

    return {
      ...theme,
      cover: {
        ...theme.cover,
        backgroundAsset: coverAsset ?? theme.cover.backgroundAsset,
      },
      page: {
        ...theme.page,
        backgroundAsset: pageBackgroundAsset ?? theme.page.backgroundAsset,
      },
    };
  }

  private isValidAssetId(assetId: string): boolean {
    return PDF_EXPORT_ASSET_ID_PATTERN.test(assetId);
  }

  private getAssetPath(workspaceId: string, assetId: string): string {
    return `${workspaceId}/pdf-export-assets/${assetId}`;
  }
}
