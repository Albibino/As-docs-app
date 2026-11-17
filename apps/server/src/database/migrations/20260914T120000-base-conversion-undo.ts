import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('base_conversion_undos')
    .ifNotExists()
    .addColumn('page_id', 'uuid', (column) =>
      column.primaryKey().references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('workspace_id', 'uuid', (column) =>
      column.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('creator_id', 'uuid', (column) =>
      column.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('token_hash', 'varchar(128)', (column) => column.notNull())
    .addColumn('initial_views', 'jsonb', (column) => column.notNull())
    .addColumn('expires_at', 'timestamptz', (column) => column.notNull())
    .addColumn('created_at', 'timestamptz', (column) =>
      column.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_base_conversion_undos_expires_at
      ON base_conversion_undos (expires_at)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('base_conversion_undos').ifExists().execute();
}
