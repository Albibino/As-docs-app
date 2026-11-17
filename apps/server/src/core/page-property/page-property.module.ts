import { Module } from '@nestjs/common';
import { SpaceModule } from '../space/space.module';
import { PagePropertyController } from './page-property.controller';
import { PagePropertyService } from './page-property.service';

@Module({
  imports: [SpaceModule],
  controllers: [PagePropertyController],
  providers: [PagePropertyService],
  exports: [PagePropertyService],
})
export class PagePropertyModule {}
