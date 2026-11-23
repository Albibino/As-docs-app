import { Module } from '@nestjs/common';
import { AiHttpClientModule } from '../tcc-ai/ai-http-client.module';
import { AssistedWritingController } from './assisted-writing.controller';
import { AssistedWritingService } from './assisted-writing.service';

@Module({
  imports: [AiHttpClientModule],
  controllers: [AssistedWritingController],
  providers: [AssistedWritingService],
  exports: [AssistedWritingService],
})
export class AssistedWritingModule {}
