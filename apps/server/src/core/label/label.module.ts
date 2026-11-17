import { Module } from '@nestjs/common';
import { LabelController } from './label.controller';
import { LabelNodeController, LabelTreeController } from './label-tree.controller';
import { LabelService } from './label.service';
import { LabelAdminService } from './label-admin.service';
import { LabelPermissionService } from './label-permission.service';
import { LabelAuditService } from './label-audit.service';

@Module({
  controllers: [LabelController, LabelTreeController, LabelNodeController],
  providers: [
    LabelService,
    LabelAdminService,
    LabelPermissionService,
    LabelAuditService,
  ],
  exports: [LabelService, LabelAuditService],
})
export class LabelModule {}
