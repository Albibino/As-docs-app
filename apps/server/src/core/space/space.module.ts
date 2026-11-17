import { Module } from '@nestjs/common';
import { SpaceService } from './services/space.service';
import { SpaceController } from './space.controller';
import { TeamModule } from '../team/team.module';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [TeamModule, NotificationModule],
  controllers: [SpaceController],
  providers: [SpaceService],
  exports: [SpaceService],
})
export class SpaceModule {}
