import { Global, Module } from '@nestjs/common';
import SpaceAbilityFactory from './abilities/space-ability.factory';
import WorkspaceAbilityFactory from './abilities/workspace-ability.factory';
import { SpaceAuthorizationService } from '../space/services/space-authorization.service';
import { SpacePermissionService } from '../space/services/space-permission.service';
import { TeamModule } from '../team/team.module';
import { NotificationModule } from '../notification/notification.module';

@Global()
@Module({
  imports: [TeamModule, NotificationModule],
  providers: [
    WorkspaceAbilityFactory,
    SpaceAbilityFactory,
    SpaceAuthorizationService,
    SpacePermissionService,
  ],
  exports: [
    WorkspaceAbilityFactory,
    SpaceAbilityFactory,
    SpaceAuthorizationService,
    SpacePermissionService,
  ],
})
export class CaslModule {}
