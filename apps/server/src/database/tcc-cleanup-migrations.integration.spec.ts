/**
 * Migrações de limpeza do TCC contra Postgres real. Pula sem
 * `TCC_TEST_DATABASE_URL` (ver docs/tcc/05-testes.md).
 *
 * Cria um banco descartável, aplica as migrações até a anterior à limpeza,
 * grava dados do Clerk e do diretório externo (como num banco antigo) e então
 * aplica as migrações do TCC, conferindo que:
 * - colunas, índices e tabelas do Clerk e do Directory somem;
 * - propriedades de página do tipo `customer` e seus valores somem, e as de
 *   outros tipos ficam intactas;
 * - o tipo `customer` deixa de ser aceito;
 * - modelos de página (`templates`, `template_labels`, favoritos de modelo e a
 *   configuração `templates` do workspace) somem;
 * - billing, MFA, SCIM e chaves de API (tabelas, colunas e a configuração
 *   `api` do workspace) somem, mas a tabela `audit` e o histórico de labels
 *   gravado nela ficam;
 * - a personalização da home do space (`space_home_layouts`) some, e o índice
 *   `idx_pages_last_updated_by_recent`, criado junto, fica.
 */
import * as path from 'path';
import { promises as fs } from 'fs';
import {
  CamelCasePlugin,
  FileMigrationProvider,
  Kysely,
  Migrator,
  sql,
} from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require('postgres');

const url = process.env.TCC_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;
const TEST_DB = 'tcc_cleanup_migrations_test';
const BEFORE_CLEANUP = '20261002T120000-tcc-versioned-ai-index';

function connect(databaseUrl: string, camelCase = false) {
  return new Kysely<any>({
    dialect: new PostgresJSDialect({
      postgres: postgres(databaseUrl, { max: 1, onnotice: () => undefined }),
    }),
    plugins: camelCase ? [new CamelCasePlugin()] : [],
  });
}

describeDb('TCC cleanup migrations — Postgres', () => {
  let admin: Kysely<any>;
  let db: Kysely<any>;
  // Migrações rodam sem plugin (como em migrate.ts); os dados, com camelCase
  // (como no app).
  let rawDb: Kysely<any>;
  let migrator: Migrator;

  beforeAll(async () => {
    admin = connect(url!);
    await sql`DROP DATABASE IF EXISTS ${sql.raw(TEST_DB)} WITH (FORCE)`.execute(admin);
    await sql`CREATE DATABASE ${sql.raw(TEST_DB)}`.execute(admin);
    const target = new URL(url!);
    target.pathname = `/${TEST_DB}`;
    db = connect(target.toString(), true);
    rawDb = connect(target.toString());
    migrator = new Migrator({
      db: rawDb,
      provider: new FileMigrationProvider({
        fs,
        path,
        migrationFolder: path.join(__dirname, 'migrations'),
      }),
    });
  }, 120_000);

  afterAll(async () => {
    await db?.destroy();
    await rawDb?.destroy();
    if (admin) {
      await sql`DROP DATABASE IF EXISTS ${sql.raw(TEST_DB)} WITH (FORCE)`.execute(
        admin,
      );
      await admin.destroy();
    }
  }, 60_000);

  const columnExists = async (table: string, column: string) =>
    (
      await sql<{ n: number }>`
        SELECT count(*)::int AS n FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = ${table} AND column_name = ${column}
      `.execute(db)
    ).rows[0].n > 0;

  const tableExists = async (table: string) =>
    (await sql<{ t: string | null }>`SELECT to_regclass(${table})::text AS t`.execute(db))
      .rows[0].t !== null;

  it('removes Clerk, the external directory, templates and the optional modules, keeping the rest', async () => {
    const before = await migrator.migrateTo(BEFORE_CLEANUP);
    expect(before.error).toBeUndefined();

    // Estado de um banco antigo, com dados do Clerk e do Directory.
    const { id: workspaceId } = await db
      .insertInto('workspaces')
      .values({
        name: 'w',
        directoryOrganizationKey: 'org-1',
        clerkOrganizationId: 'org_clerk',
        stripeCustomerId: 'cus_1',
        billingEmail: 'b@x.test',
        trialEndAt: new Date(),
        enforceMfa: true,
        isScimEnabled: true,
        auditRetentionDays: 30,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: userId } = await db
      .insertInto('users')
      .values({
        name: 'u',
        email: 'u@x.test',
        workspaceId,
        clerkUserId: 'user_clerk',
        scimExternalId: 'scim-1',
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: teamId } = await db
      .insertInto('teams')
      .values({ name: 't', workspaceId, creatorId: userId })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: spaceId } = await db
      .insertInto('spaces')
      .values({ name: 's', slug: 's', workspaceId, teamId })
      .returning('id')
      .executeTakeFirstOrThrow();
    // Home do space personalizada: layout da equipe e layout pessoal.
    await db
      .insertInto('spaceHomeLayouts')
      .values([
        { spaceId, workspaceId, layout: '{}' },
        { spaceId, workspaceId, layout: '{}', userId },
      ])
      .execute();
    const { id: pageId } = await db
      .insertInto('pages')
      .values({ slugId: 'p1', title: 'p', spaceId, workspaceId, customerKey: 'cli-1' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const customer = await db
      .insertInto('pagePropertyDefinitions')
      .values({ workspaceId, name: 'Cliente', type: 'customer' })
      .returning('id')
      .executeTakeFirstOrThrow();
    const date = await db
      .insertInto('pagePropertyDefinitions')
      .values({ workspaceId, name: 'Data', type: 'date' })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db
      .insertInto('pagePropertyValues')
      .values([
        { pageId, propertyId: customer.id, value: JSON.stringify('cli-1') },
        { pageId, propertyId: date.id, value: JSON.stringify('2026-10-02') },
      ])
      .execute();
    const { id: templateId } = await db
      .insertInto('templates')
      .values({ title: 'Modelo', workspaceId, spaceId, creatorId: userId })
      .returning('id')
      .executeTakeFirstOrThrow();
    const { id: labelId } = await db
      .insertInto('labels')
      .values({ name: 'rh', slug: 'rh', workspaceId })
      .returning('id')
      .executeTakeFirstOrThrow();
    await db.insertInto('templateLabels').values({ templateId, labelId }).execute();
    await db
      .insertInto('favorites')
      .values([
        { userId, workspaceId, type: 'template', templateId },
        { userId, workspaceId, type: 'page', pageId },
      ])
      .execute();
    await sql`UPDATE workspaces SET settings = '{"templates":{"allowMemberTemplates":true},"api":{"restrictToAdmins":true},"ai":{"chat":true}}'::jsonb`.execute(
      db,
    );
    await db
      .insertInto('billing')
      .values({
        stripeSubscriptionId: 'sub_1',
        status: 'active',
        periodStartAt: new Date(),
        workspaceId,
      })
      .execute();
    await db.insertInto('userMfa').values({ userId, workspaceId, secret: 's' }).execute();
    await db.insertInto('apiKeys').values({ name: 'k', creatorId: userId, workspaceId }).execute();
    await db
      .insertInto('scimTokens')
      .values({ name: 't', tokenHash: 'h', tokenLastFour: '1234', creatorId: userId, workspaceId })
      .execute();
    // Histórico de labels: única coisa que ainda vive na tabela `audit`.
    await db
      .insertInto('audit')
      .values({
        workspaceId,
        actorId: userId,
        event: 'page.label_added',
        resourceType: 'page',
        resourceId: pageId,
      })
      .execute();
    await db
      .insertInto('customerDirectoryProjections')
      .values({
        customerKey: 'cli-1',
        organizationKey: 'org-1',
        name: 'Cliente 1',
        slug: 'cliente-1',
        status: 'active',
        sourceUpdatedAt: 1,
        lastEventId: 'e1',
        lastOccurredAt: 1,
      })
      .execute();

    const after = await migrator.migrateToLatest();
    expect(after.error).toBeUndefined();

    for (const [table, column] of [
      ['favorites', 'template_id'],
      ['users', 'clerk_user_id'],
      ['workspaces', 'clerk_organization_id'],
      ['workspaces', 'directory_organization_key'],
      ['pages', 'customer_key'],
      ['users', 'scim_external_id'],
      ['workspaces', 'stripe_customer_id'],
      ['workspaces', 'billing_email'],
      ['workspaces', 'trial_end_at'],
      ['workspaces', 'enforce_mfa'],
      ['workspaces', 'is_scim_enabled'],
      ['workspaces', 'audit_retention_days'],
    ]) {
      expect(`${table}.${column}: ${await columnExists(table, column)}`).toBe(
        `${table}.${column}: false`,
      );
    }
    for (const table of [
      'templates',
      'template_labels',
      'template_required_groups',
      'customer_directory_projections',
      'principal_profile_projections',
      'organization_access_projections',
      'directory_event_receipts',
      'billing',
      'user_mfa',
      'scim_tokens',
      'api_keys',
      'space_home_layouts',
    ]) {
      expect(`${table}: ${await tableExists(table)}`).toBe(`${table}: false`);
    }
    expect(await tableExists('idx_pages_last_updated_by_recent')).toBe(true);

    const definitions = await db
      .selectFrom('pagePropertyDefinitions')
      .select(['name', 'type'])
      .execute();
    expect(definitions).toEqual([{ name: 'Data', type: 'date' }]);
    const values = await db.selectFrom('pagePropertyValues').select('propertyId').execute();
    expect(values).toEqual([{ propertyId: date.id }]);

    // A label continua existindo; só o vínculo com o modelo some.
    expect(await db.selectFrom('labels').select('name').execute()).toEqual([
      { name: 'rh' },
    ]);
    // Só o favorito de página sobrevive; a configuração de IA do workspace fica.
    expect(await db.selectFrom('favorites').select('type').execute()).toEqual([
      { type: 'page' },
    ]);
    expect(
      (await db.selectFrom('workspaces').select('settings').executeTakeFirstOrThrow())
        .settings,
    ).toEqual({ ai: { chat: true } });

    // O histórico de labels continua na tabela `audit`.
    expect(await db.selectFrom('audit').select('event').execute()).toEqual([
      { event: 'page.label_added' },
    ]);

    // O resto da página e do usuário continua lá.
    expect(await db.selectFrom('pages').select('title').execute()).toEqual([{ title: 'p' }]);
    expect(await db.selectFrom('users').select('email').execute()).toEqual([
      { email: 'u@x.test' },
    ]);

    await expect(
      db
        .insertInto('pagePropertyDefinitions')
        .values({ workspaceId, name: 'x', type: 'customer' })
        .execute(),
    ).rejects.toThrow(/page_property_definitions_type_check/);
  }, 120_000);
});
