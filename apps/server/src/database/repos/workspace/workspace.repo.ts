import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB, KyselyTransaction } from '../../types/kysely.types';
import { dbOrTx } from '../../utils';
import {
  InsertableWorkspace,
  UpdatableWorkspace,
  Workspace,
} from '@tcc-docs/db/types/entity.types';
import { ExpressionBuilder, sql } from 'kysely';
import { DB, Workspaces } from '@tcc-docs/db/types/db';

@Injectable()
export class WorkspaceRepo {
  public baseFields: Array<keyof Workspaces> = [
    'id',
    'name',
    'description',
    'logo',
    'hostname',
    'customDomain',
    'settings',
    'defaultRole',
    'emailDomains',
    'createdAt',
    'updatedAt',
    'deletedAt',
    'status',
    'enforceSso',
    'plan',
    'trashRetentionDays',
  ];
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  async findById(
    workspaceId: string,
    opts?: {
      withLock?: boolean;
      withMemberCount?: boolean;
      withLicenseKey?: boolean;
      trx?: KyselyTransaction;
    },
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, opts?.trx);

    let query = db
      .selectFrom('workspaces')
      .select(this.baseFields)
      .where('id', '=', workspaceId);

    if (opts?.withMemberCount) {
      query = query.select(this.withMemberCount);
    }

    if (opts?.withLicenseKey) {
      query = query.select('licenseKey');
    }

    if (opts?.withLock && opts?.trx) {
      query = query.forUpdate();
    }

    return query.executeTakeFirst();
  }

  async findFirst(): Promise<Workspace> {
    return await this.db
      .selectFrom('workspaces')
      .select(this.baseFields)
      .orderBy('createdAt', 'asc')
      .limit(1)
      .executeTakeFirst();
  }

  async updateWorkspace(
    updatableWorkspace: UpdatableWorkspace,
    workspaceId: string,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({ ...updatableWorkspace, updatedAt: new Date() })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async insertWorkspace(
    insertableWorkspace: InsertableWorkspace,
    trx?: KyselyTransaction,
  ): Promise<Workspace> {
    const db = dbOrTx(this.db, trx);
    return db
      .insertInto('workspaces')
      .values(insertableWorkspace)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async count(): Promise<number> {
    const { count } = await this.db
      .selectFrom('workspaces')
      .select((eb) => eb.fn.count('id').as('count'))
      .executeTakeFirst();
    return count as number;
  }

  withMemberCount(eb: ExpressionBuilder<DB, 'workspaces'>) {
    return eb
      .selectFrom('users')
      .select((eb) => eb.fn.countAll().as('count'))
      .where('users.deactivatedAt', 'is', null)
      .where('users.deletedAt', 'is', null)
      .whereRef('users.workspaceId', '=', 'workspaces.id')
      .as('memberCount');
  }

  async getActiveUserCount(workspaceId: string): Promise<number> {
    const users = await this.db
      .selectFrom('users')
      .select(['id', 'deactivatedAt', 'deletedAt'])
      .where('workspaceId', '=', workspaceId)
      .execute();

    const activeUsers = users.filter(
      (user) => user.deletedAt === null && user.deactivatedAt === null,
    );

    return activeUsers.length;
  }

  async updateAiSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('ai', COALESCE(settings->'ai', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateSpaceSettings(
    workspaceId: string,
    prefKey: string,
    prefValue: string | boolean,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('spaces', COALESCE(settings->'spaces', '{}'::jsonb)
                || jsonb_build_object('${sql.raw(prefKey)}', ${sql.lit(prefValue)}))`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updateDefaultPageEditMode(
    workspaceId: string,
    pageEditMode: string,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('defaultPageEditMode', ${sql.lit(pageEditMode)})`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }

  async updatePdfExportSettings(
    workspaceId: string,
    settings: unknown,
    trx?: KyselyTransaction,
  ) {
    const db = dbOrTx(this.db, trx);
    return db
      .updateTable('workspaces')
      .set({
        settings: sql`COALESCE(settings, '{}'::jsonb)
                || jsonb_build_object('pdfExport', ${JSON.stringify(settings)}::text::jsonb)`,
        updatedAt: new Date(),
      })
      .where('id', '=', workspaceId)
      .returning(this.baseFields)
      .executeTakeFirst();
  }
}
