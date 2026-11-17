import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_property_definitions')
    .alterColumn('space_id', (col) => col.dropNotNull())
    .execute();

  await sql`
    CREATE UNIQUE INDEX page_property_definitions_workspace_name_unique
      ON page_property_definitions (workspace_id, lower(name))
      WHERE space_id IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX page_property_definitions_workspace_position_idx
      ON page_property_definitions (workspace_id, position, id)
      WHERE space_id IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('page_property_definitions_workspace_position_idx')
    .execute();
  await db.schema
    .dropIndex('page_property_definitions_workspace_name_unique')
    .execute();
  await db
    .deleteFrom('page_property_definitions')
    .where('space_id', 'is', null)
    .execute();
  await db.schema
    .alterTable('page_property_definitions')
    .alterColumn('space_id', (col) => col.setNotNull())
    .execute();
}
