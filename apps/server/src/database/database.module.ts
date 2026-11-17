import { Global, Logger, Module, OnApplicationBootstrap } from '@nestjs/common';
import { InjectKysely, KyselyModule } from 'nestjs-kysely';
import { EnvironmentService } from '../integrations/environment/environment.service';
import { CamelCasePlugin, LogEvent, sql } from 'kysely';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { PageRepo } from './repos/page/page.repo';
import { PagePermissionRepo } from './repos/page/page-permission.repo';
import { CommentRepo } from './repos/comment/comment.repo';
import { PageTransclusionsRepo } from './repos/page-transclusions/page-transclusions.repo';
import { PageTransclusionReferencesRepo } from './repos/page-transclusions/page-transclusion-references.repo';
import { PageHistoryRepo } from './repos/page/page-history.repo';
import { AttachmentRepo } from './repos/attachment/attachment.repo';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import * as process from 'node:process';
import { MigrationService } from '@tcc-docs/db/services/migration.service';
import { UserTokenRepo } from './repos/user-token/user-token.repo';
import { UserSessionRepo } from '@tcc-docs/db/repos/session/user-session.repo';
import { BacklinkRepo } from '@tcc-docs/db/repos/backlink/backlink.repo';
import { NotificationRepo } from '@tcc-docs/db/repos/notification/notification.repo';
import { WatcherRepo } from '@tcc-docs/db/repos/watcher/watcher.repo';
import { LabelRepo } from '@tcc-docs/db/repos/label/label.repo';
import { LabelTreeRepo } from '@tcc-docs/db/repos/label/label-tree.repo';
import { FavoriteRepo } from '@tcc-docs/db/repos/favorite/favorite.repo';
import { PagePropertyRepo } from '@tcc-docs/db/repos/page-property/page-property.repo';
import { PageListener } from '@tcc-docs/db/listeners/page.listener';
import { PostgresJSDialect } from 'kysely-postgres-js';
import * as postgres from 'postgres';
import { normalizePostgresUrl } from '../common/helpers';
import { SpacePermissionRepo } from './repos/space/space-permission.repo';
import { TeamRepo } from '@tcc-docs/db/repos/team/team.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';

@Global()
@Module({
  imports: [
    KyselyModule.forRootAsync({
      imports: [],
      inject: [EnvironmentService],
      useFactory: (environmentService: EnvironmentService) => ({
        dialect: new PostgresJSDialect({
          postgres: postgres(
            normalizePostgresUrl(environmentService.getDatabaseURL()),
            {
              max: environmentService.getDatabaseMaxPool(),
              onnotice: () => {},
              types: {
                bigint: {
                  to: 20,
                  from: [20, 1700],
                  serialize: (value: number) => value.toString(),
                  parse: (value: string) => Number.parseInt(value),
                },
              },
            },
          ),
        }),
        plugins: [new CamelCasePlugin()],
        log: (event: LogEvent) => {
          if (environmentService.getNodeEnv() !== 'development') return;
          const logger = new Logger(DatabaseModule.name);
          if (process.env.DEBUG_DB?.toLowerCase() === 'true') {
            logger.debug(event.query.sql);
            logger.debug('query time: ' + event.queryDurationMillis + ' ms');
          }
        },
      }),
    }),
  ],
  providers: [
    MigrationService,
    WorkspaceRepo,
    UserRepo,
    TeamRepo,
    TeamMemberRepo,
    SpaceRepo,
    SpaceMemberRepo,
    SpacePermissionRepo,
    PageRepo,
    PagePermissionRepo,
    PageTransclusionsRepo,
    PageTransclusionReferencesRepo,
    PageHistoryRepo,
    CommentRepo,
    FavoriteRepo,
    AttachmentRepo,
    UserTokenRepo,
    UserSessionRepo,
    BacklinkRepo,
    NotificationRepo,
    WatcherRepo,
    LabelRepo,
    LabelTreeRepo,
    PagePropertyRepo,
    PageListener,
  ],
  exports: [
    WorkspaceRepo,
    UserRepo,
    TeamRepo,
    TeamMemberRepo,
    SpaceRepo,
    SpaceMemberRepo,
    SpacePermissionRepo,
    PageRepo,
    PagePermissionRepo,
    PageTransclusionsRepo,
    PageTransclusionReferencesRepo,
    PageHistoryRepo,
    CommentRepo,
    FavoriteRepo,
    AttachmentRepo,
    UserTokenRepo,
    UserSessionRepo,
    BacklinkRepo,
    NotificationRepo,
    WatcherRepo,
    LabelRepo,
    LabelTreeRepo,
    PagePropertyRepo,
  ],
})
export class DatabaseModule implements OnApplicationBootstrap {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private readonly migrationService: MigrationService,
    private readonly environmentService: EnvironmentService,
  ) {}

  async onApplicationBootstrap() {
    await this.establishConnection();

    if (this.environmentService.getNodeEnv() === 'production') {
      await this.migrationService.migrateToLatest();
    }
  }

  async establishConnection() {
    const retryAttempts = 15;
    const retryDelay = 3000;

    this.logger.log('Establishing database connection');
    for (let i = 0; i < retryAttempts; i++) {
      try {
        await sql`SELECT 1=1`.execute(this.db);
        this.logger.log('Database connection successful');
        break;
      } catch (err) {
        if (err['errors']) {
          this.logger.error(err['errors'][0]);
        } else {
          this.logger.error(err);
        }

        if (i < retryAttempts - 1) {
          this.logger.log(
            `Retrying [${i + 1}/${retryAttempts}] in ${retryDelay / 1000} seconds`,
          );
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
        } else {
          this.logger.error(
            `Failed to connect to database after ${retryAttempts} attempts. Exiting...`,
          );
          process.exit(1);
        }
      }
    }
  }
}
