import { Module } from '@nestjs/common';
import { TeamController } from './team.controller';
import { TeamService } from './services/team.service';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [NotificationModule],
  controllers: [TeamController],
  providers: [TeamService],
  exports: [TeamService],
})
export class TeamModule {}
