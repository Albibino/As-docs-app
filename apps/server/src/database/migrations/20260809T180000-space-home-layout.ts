import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('space_home_layouts')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull().unique(),
    )
    .addColumn('layout', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .execute();

  // Feeds the header history dropdown: pages the user was the last to edit,
  // newest first. Partial so soft-deleted pages stay out of the index.
  await sql`
    CREATE INDEX IF NOT EXISTS idx_pages_last_updated_by_recent
      ON pages (last_updated_by_id, updated_at DESC)
      WHERE deleted_at IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_pages_last_updated_by_recent`.execute(db);
  await db.schema.dropTable('space_home_layouts').execute();
}
