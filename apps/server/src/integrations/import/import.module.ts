import { Module } from '@nestjs/common';
import { ImportService } from './services/import.service';
import { ImportController } from './import.controller';
import { StorageModule } from '../storage/storage.module';
import { FileImportTaskService } from './services/file-import-task.service';
import { FileTaskProcessor } from './processors/file-task.processor';
import { ImportAttachmentService } from './services/import-attachment.service';
import { FileTaskController } from './file-task.controller';
import { PageModule } from '../../core/page/page.module';
import { AttachmentModule } from '../../core/attachment/attachment.module';
import { FolderImportController } from './folder-import.controller';
import { FolderImportSessionService } from './services/folder-import-session.service';
import {
  FolderImportItemRepo,
  FolderImportUploadService,
} from './services/folder-import-upload.service';
import {
  FOLDER_IMPORT_CONVERTER,
  FolderImportProcessingRepo,
  FolderImportProcessingService,
} from './services/folder-import-processing.service';
import {
  FolderImportRunRepo,
  FolderImportRunService,
} from './services/folder-import-run.service';

@Module({
  providers: [
    ImportService,
    FileImportTaskService,
    FileTaskProcessor,
    ImportAttachmentService,
    FolderImportSessionService,
    FolderImportItemRepo,
    FolderImportUploadService,
    FolderImportProcessingRepo,
    FolderImportProcessingService,
    FolderImportRunRepo,
    FolderImportRunService,
    {
      provide: FOLDER_IMPORT_CONVERTER,
      useExisting: ImportService,
    },
  ],
  exports: [ImportService, ImportAttachmentService],
  controllers: [
    ImportController,
    FileTaskController,
    FolderImportController,
  ],
  imports: [
    StorageModule,
    PageModule,
    AttachmentModule,
  ],
})
export class ImportModule {}
