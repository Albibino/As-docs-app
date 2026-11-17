import { Kysely, sql } from 'kysely';

/**
 * Repairs databases that ran 20260806T090000-remove-legacy-auth while the
 * runtime still depended on workspace-local user sessions.
 *
 * Fresh databases keep the table created by 20260326T121350-user-sessions;
 * existing affected databases recreate it here. Session rows that were
 * dropped cannot be recovered, so users may need to authenticate once more.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('user_sessions')
    .ifNotExists()
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('user_id', 'uuid', (col) =>
      col.notNull().references('users.id').onDelete('cascade'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.notNull().references('workspaces.id').onDelete('cascade'),
    )
    .addColumn('device_name', 'varchar')
    .addColumn('user_agent', 'text')
    .addColumn('ip_address', sql`inet`)
    .addColumn('geo_location', 'varchar')
    .addColumn('last_active_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('expires_at', 'timestamptz', (col) => col.notNull())
    .addColumn('metadata', 'jsonb')
    .addColumn('revoked_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_active
    ON user_sessions (user_id, workspace_id, last_active_at DESC)
    WHERE revoked_at IS NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_revoked
    ON user_sessions (expires_at)
    WHERE revoked_at IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS idx_user_sessions_user_workspace
    ON user_sessions (user_id, workspace_id)
  `.execute(db);
}

export async function down(): Promise<void> {
  // Deliberately preserved: current runtime paths require user_sessions.
}
