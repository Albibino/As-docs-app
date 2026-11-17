import { Module } from '@nestjs/common';
import { WorkspaceService } from './services/workspace.service';
import { WorkspaceController } from './controllers/workspace.controller';
import { SpaceModule } from '../space/space.module';
import { TokenModule } from '../auth/token.module';
import { TeamModule } from '../team/team.module';
import { PdfExportAssetsModule } from '../../integrations/export/pdf/pdf-export-assets.module';

@Module({
  imports: [SpaceModule, TeamModule, TokenModule, PdfExportAssetsModule],
  controllers: [WorkspaceController],
  providers: [WorkspaceService],
  exports: [WorkspaceService],
})
export class WorkspaceModule {}
