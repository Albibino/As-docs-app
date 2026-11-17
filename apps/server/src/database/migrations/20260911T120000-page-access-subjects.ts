import { Kysely, sql } from 'kysely';

/**
 * Page access rules may target an individual, a Team or every
 * active member of the Workspace. `shared` rules overlay the Space ACL while
 * `restricted` keeps the legacy allow-list behaviour.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE page_access
      ADD COLUMN IF NOT EXISTS access_mode varchar NOT NULL DEFAULT 'restricted'
  `.execute(db);

  await sql`
    ALTER TABLE page_permissions
      ADD COLUMN IF NOT EXISTS team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
      ADD COLUMN IF NOT EXISTS workspace_wide boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_view boolean NOT NULL DEFAULT true,
      ADD COLUMN IF NOT EXISTS can_edit boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS can_delete boolean NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS include_subpages boolean NOT NULL DEFAULT false
  `.execute(db);

  await sql`
    UPDATE page_permissions
    SET
      can_view = true,
      can_edit = role = 'writer',
      can_delete = false
  `.execute(db);
  await sql`
    UPDATE page_permissions
    SET include_subpages = true
    WHERE page_access_id IN (
      SELECT id FROM page_access WHERE access_mode = 'restricted'
    )
  `.execute(db);

  await sql`
    ALTER TABLE page_permissions
      ALTER COLUMN user_id DROP NOT NULL,
      ALTER COLUMN role DROP NOT NULL,
      DROP CONSTRAINT IF EXISTS allow_page_permission_subject,
      ADD CONSTRAINT allow_page_permission_subject CHECK (
        (CASE WHEN user_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN team_id IS NOT NULL THEN 1 ELSE 0 END) +
        (CASE WHEN workspace_wide THEN 1 ELSE 0 END) = 1
      )
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS page_permissions_team_target_unique
      ON page_permissions (page_access_id, team_id)
      WHERE team_id IS NOT NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX IF NOT EXISTS page_permissions_workspace_target_unique
      ON page_permissions (page_access_id)
      WHERE workspace_wide = true
  `.execute(db);
  await sql`
    CREATE INDEX IF NOT EXISTS page_permissions_team_id_idx
      ON page_permissions (team_id)
      WHERE team_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS page_permissions_team_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS page_permissions_workspace_target_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS page_permissions_team_target_unique`.execute(db);
  await sql`
    ALTER TABLE page_permissions
      DROP CONSTRAINT IF EXISTS allow_page_permission_subject,
      ALTER COLUMN user_id SET NOT NULL,
      ALTER COLUMN role SET NOT NULL,
      DROP COLUMN IF EXISTS include_subpages,
      DROP COLUMN IF EXISTS can_delete,
      DROP COLUMN IF EXISTS can_edit,
      DROP COLUMN IF EXISTS can_view,
      DROP COLUMN IF EXISTS workspace_wide,
      DROP COLUMN IF EXISTS team_id
  `.execute(db);
  await sql`ALTER TABLE page_access DROP COLUMN IF EXISTS access_mode`.execute(db);
}
