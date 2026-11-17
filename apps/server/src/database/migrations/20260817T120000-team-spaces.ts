import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // A directory team maps to exactly one space. There is no lead/member split
  // here: that distinction already lives in the two groups the sync attaches
  // to the space, so a space needs no counterpart to `external_team_role`.
  await db.schema
    .alterTable('spaces')
    .addColumn('external_team_id', 'varchar')
    .execute();

  // Stamped when the team disappears from a workspace-wide snapshot. The space
  // and every page in it survive; access is already gone because the group
  // sync emptied the attached groups. If the team returns, so does the access.
  await db.schema
    .alterTable('spaces')
    .addColumn('external_orphaned_at', 'timestamptz')
    .execute();

  // Two reconcile passes can overlap — the interval sweep and the debounced
  // one on the request path. This is what makes the loser fail loudly instead
  // of creating a second space for the same team.
  await db.schema
    .createIndex('spaces_workspace_external_team_unique')
    .on('spaces')
    .columns(['workspace_id', 'external_team_id'])
    .where(sql<boolean>`external_team_id is not null`)
    .unique()
    .execute();

  // The directory describes a team's look as an icon name plus a colour name, not as
  // an image. Stored as the keys themselves because the colour has to resolve
  // per colour scheme at render time, which a baked asset cannot do.
  await db.schema
    .alterTable('spaces')
    .addColumn('icon_key', 'varchar')
    .execute();

  await db.schema
    .alterTable('spaces')
    .addColumn('icon_color', 'varchar')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.alterTable('spaces').dropColumn('icon_color').execute();
  await db.schema.alterTable('spaces').dropColumn('icon_key').execute();
  await db.schema.dropIndex('spaces_workspace_external_team_unique').execute();
  await db.schema
    .alterTable('spaces')
    .dropColumn('external_orphaned_at')
    .execute();
  await db.schema
    .alterTable('spaces')
    .dropColumn('external_team_id')
    .execute();
}
