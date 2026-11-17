import { Module } from '@nestjs/common';
import { StorageModule } from '../../storage/storage.module';
import { PdfExportAssetsService } from './pdf-export-assets.service';

@Module({
  imports: [StorageModule],
  providers: [PdfExportAssetsService],
  exports: [PdfExportAssetsService],
})
export class PdfExportAssetsModule {}
