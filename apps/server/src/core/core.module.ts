import {
  MiddlewareConsumer,
  Module,
  NestModule,
  RequestMethod,
} from '@nestjs/common';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { WorkspaceModule } from './workspace/workspace.module';
import { PageModule } from './page/page.module';
import { AttachmentModule } from './attachment/attachment.module';
import { CommentModule } from './comment/comment.module';
import { SearchModule } from './search/search.module';
import { SpaceModule } from './space/space.module';
import { CaslModule } from './casl/casl.module';
import { PageAccessModule } from './page/page-access/page-access.module';
import { DomainMiddleware } from '../common/middlewares/domain.middleware';
import { AuditContextMiddleware } from '../common/middlewares/audit-context.middleware';
import { LabelModule } from './label/label.module';
import { NotificationModule } from './notification/notification.module';
import { WatcherModule } from './watcher/watcher.module';
import { FavoriteModule } from './favorite/favorite.module';
import { SessionModule } from './session/session.module';
import { ClsMiddleware } from 'nestjs-cls';
import { PagePropertyModule } from './page-property/page-property.module';
import { TeamModule } from './team/team.module';
import { TccModule } from './tcc/tcc.module';

@Module({
  imports: [
    UserModule,
    AuthModule,
    WorkspaceModule,
    PageModule,
    AttachmentModule,
    CommentModule,
    FavoriteModule,
    SearchModule,
    SpaceModule,
    CaslModule,
    PageAccessModule,
    LabelModule,
    NotificationModule,
    WatcherModule,
    SessionModule,
    PagePropertyModule,
    TeamModule,
    TccModule,
  ],
})
export class CoreModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    const excludedRoutes = [
      { path: 'health', method: RequestMethod.GET },
      { path: 'health/live', method: RequestMethod.GET },
    ];

    consumer
      .apply(DomainMiddleware)
      .exclude(...excludedRoutes)
      .forRoutes('*');

    consumer
      .apply(AuditContextMiddleware)
      .exclude(...excludedRoutes)
      .forRoutes('*');
  }
}
