import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { StorageModule } from '../storage/storage.module';
import { DocxExportService } from './docx/docx-export.service';
import { DocxExportController } from './docx/docx-export.controller';
import { PdfExportRenderer } from './pdf/pdf-export-renderer';
import { PdfExportService } from './pdf/pdf-export.service';
import { PdfExportAssetsModule } from './pdf/pdf-export-assets.module';

@Module({
  imports: [StorageModule, PdfExportAssetsModule],
  providers: [
    ExportService,
    DocxExportService,
    PdfExportRenderer,
    PdfExportService,
  ],
  controllers: [ExportController, DocxExportController],
})
export class ExportModule {}
