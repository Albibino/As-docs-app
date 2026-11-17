import { Kysely, sql } from 'kysely';

/**
 * The maintenance window switches authorization to teams and
 * space_permissions. Group members attached to Spaces were expanded into
 * individual migration inputs before this cleanup runs.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE FROM page_permissions
    WHERE group_id IS NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE page_permissions
      DROP CONSTRAINT IF EXISTS page_access_group_unique,
      DROP CONSTRAINT IF EXISTS allow_either_user_id_or_group_id_check,
      DROP COLUMN IF EXISTS group_id
  `.execute(db);

  await sql`
    ALTER TABLE page_permissions
      ALTER COLUMN user_id SET NOT NULL
  `.execute(db);

  await sql`
    ALTER TABLE workspace_invitations
      DROP COLUMN IF EXISTS group_ids
  `.execute(db);

  await sql`
    ALTER TABLE auth_providers
      DROP COLUMN IF EXISTS group_sync
  `.execute(db);

  await sql`
    ALTER TABLE spaces
      DROP COLUMN IF EXISTS default_role,
      DROP COLUMN IF EXISTS visibility,
      DROP COLUMN IF EXISTS external_team_id,
      DROP COLUMN IF EXISTS external_orphaned_at,
      DROP COLUMN IF EXISTS icon_key,
      DROP COLUMN IF EXISTS icon_color
  `.execute(db);

  await sql`
    ALTER TABLE workspaces
      DROP COLUMN IF EXISTS default_space_id
  `.execute(db);

  await sql`DROP TABLE IF EXISTS space_members`.execute(db);
  await sql`DROP TABLE IF EXISTS group_users`.execute(db);
  await sql`DROP TABLE IF EXISTS groups`.execute(db);
}

export async function down(_db: Kysely<any>): Promise<void> {
  // The migration intentionally removes authorization data and cannot restore
  // it without an explicit export/import policy for the old groups.
}
