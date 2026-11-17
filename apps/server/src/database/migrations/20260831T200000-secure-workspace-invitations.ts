import { Kysely, sql } from 'kysely';

const INVITATION_TTL_DAYS = 7;

/**
 * Invitation links are bearer credentials. Keep only their SHA-256 digest and
 * give pending invitations a finite lifetime.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`CREATE EXTENSION IF NOT EXISTS pgcrypto`.execute(db);

  await sql`
    ALTER TABLE workspace_invitations
      ADD COLUMN IF NOT EXISTS expires_at timestamptz
  `.execute(db);

  await sql`
    UPDATE workspace_invitations
    SET
      token = encode(digest(token, 'sha256'), 'hex'),
      expires_at = COALESCE(
        expires_at,
        created_at + (${sql.lit(INVITATION_TTL_DAYS)} * interval '1 day')
      )
  `.execute(db);

  await sql`
    ALTER TABLE workspace_invitations
      ALTER COLUMN expires_at SET NOT NULL,
      ALTER COLUMN expires_at SET DEFAULT (now() + interval '7 days')
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS workspace_invitations_pending_expiry_idx
      ON workspace_invitations (workspace_id, expires_at)
      WHERE status = 'pending'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DROP INDEX IF EXISTS workspace_invitations_pending_expiry_idx
  `.execute(db);
  await sql`
    ALTER TABLE workspace_invitations
      DROP COLUMN IF EXISTS expires_at
  `.execute(db);

  // Token hashes are intentionally irreversible. Rolling back this migration
  // requires resending pending invitations to issue new links.
}
