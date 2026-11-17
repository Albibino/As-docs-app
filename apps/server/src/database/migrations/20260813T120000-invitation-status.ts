import { Kysely, sql } from 'kysely';

/**
 * Invitations used to be deleted the moment they were accepted, which left no
 * way to answer whether an invitation was ever accepted, and no way to tell a
 * declined invitation from one that was never opened.
 *
 * Additive with a default, so existing rows become `pending` and keep working
 * through the emailed link.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE workspace_invitations
      ADD COLUMN IF NOT EXISTS status varchar(20) NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS accepted_by_id uuid REFERENCES users(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
      ADD COLUMN IF NOT EXISTS declined_at timestamptz
  `.execute(db);

  // The pending list is read on every invitation screen and on every admin
  // members page, always scoped to a workspace.
  await sql`
    CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_id_status_idx
      ON workspace_invitations (workspace_id, status)
  `.execute(db);

  // Matching an invitation to the signed-in user goes through the email.
  await sql`
    CREATE INDEX IF NOT EXISTS workspace_invitations_email_status_idx
      ON workspace_invitations (email, status)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS workspace_invitations_email_status_idx`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS workspace_invitations_workspace_id_status_idx`.execute(
    db,
  );
  await sql`
    ALTER TABLE workspace_invitations
      DROP COLUMN IF EXISTS declined_at,
      DROP COLUMN IF EXISTS accepted_at,
      DROP COLUMN IF EXISTS accepted_by_id,
      DROP COLUMN IF EXISTS status
  `.execute(db);
}
