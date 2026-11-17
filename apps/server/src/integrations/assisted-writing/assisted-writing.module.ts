import { Module } from '@nestjs/common';
import { AssistedWritingController } from './assisted-writing.controller';
import { AssistedWritingService } from './assisted-writing.service';

@Module({
  controllers: [AssistedWritingController],
  providers: [AssistedWritingService],
  exports: [AssistedWritingService],
})
export class AssistedWritingModule {}
