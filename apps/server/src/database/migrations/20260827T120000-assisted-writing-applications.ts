import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('ai_assisted_writing_applications')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('page_history_id', 'uuid', (col) =>
      col.references('page_history.id').onDelete('cascade').notNull(),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade').notNull(),
    )
    .addColumn('session_id', 'uuid', (col) => col.notNull())
    .addColumn('operations', 'jsonb', (col) => col.notNull())
    .addColumn('before_hashes', 'jsonb', (col) => col.notNull())
    .addColumn('after_hashes', 'jsonb', (col) => col.notNull())
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('ended_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('idx_ai_assisted_writing_active_session')
    .ifNotExists()
    .on('ai_assisted_writing_applications')
    .columns(['workspace_id', 'page_id', 'user_id', 'session_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('ai_assisted_writing_applications').execute();
}
