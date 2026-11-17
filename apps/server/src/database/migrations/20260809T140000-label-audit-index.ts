import { type Kysely, sql } from 'kysely';

/**
 * The audit table is indexed for the workspace-wide feed only
 * (`workspace_id, id desc`). Reading one page's label history filters by
 * resource, which without this index degrades to a sequential scan over every
 * audit row the workspace has ever written.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    CREATE INDEX IF NOT EXISTS idx_audit_resource
      ON audit (workspace_id, resource_type, resource_id, id DESC)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_audit_resource`.execute(db);
}
