import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS workspaces_external_slug_unique`.execute(db);
  await sql`ALTER TABLE workspaces DROP COLUMN IF EXISTS external_slug`.execute(
    db,
  );
  // user_sessions is still required by JWT validation, collab tokens,
  // entitlements and the session-management API. Clerk sessions identify the
  // external login, but they do not replace this workspace-local session row.
}

export async function down(): Promise<void> {
  // The legacy external slug is intentionally not restored.
}
