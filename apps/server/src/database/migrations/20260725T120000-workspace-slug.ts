import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('external_slug', 'varchar')
    .execute();

  await db.schema
    .createIndex('workspaces_external_slug_unique')
    .on('workspaces')
    .column('external_slug')
    .where(sql<boolean>`external_slug is not null`)
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('workspaces_external_slug_unique').execute();
  await db.schema.alterTable('workspaces').dropColumn('external_slug').execute();
}
