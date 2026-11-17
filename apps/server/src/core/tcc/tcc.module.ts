import { Module } from '@nestjs/common';
import { TccSeedService } from './tcc-seed.service';

@Module({
  providers: [TccSeedService],
  exports: [TccSeedService],
})
export class TccModule {}
