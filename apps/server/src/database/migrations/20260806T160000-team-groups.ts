import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  // A directory team maps to two groups: one holding every member, one holding
  // only the leads. `group_users` has no role column, so this split is what
  // preserves the lead/member distinction as something an admin can act on
  // when attaching the groups to a space.
  await db.schema
    .alterTable('groups')
    .addColumn('external_team_id', 'varchar')
    .execute();

  await db.schema
    .alterTable('groups')
    .addColumn('external_team_role', 'varchar')
    .execute();

  // Stamped when the team disappears from the directory. The group and its space
  // attachments survive, so access returns by itself if the team comes back.
  await db.schema
    .alterTable('groups')
    .addColumn('external_orphaned_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('groups_workspace_external_team_unique')
    .on('groups')
    .columns(['workspace_id', 'external_team_id', 'external_team_role'])
    .where(sql<boolean>`external_team_id is not null`)
    .unique()
    .execute();

  // Marks a membership row as owned by the directory sync. The reconciler only
  // ever revokes rows it owns, so a grant added by hand in the app UI
  // survives every sync pass.
  await db.schema
    .alterTable('group_users')
    .addColumn('managed_by', 'varchar')
    .execute();

  await db.schema
    .createIndex('group_users_managed_by_idx')
    .on('group_users')
    .columns(['group_id', 'managed_by'])
    .where(sql<boolean>`managed_by is not null`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('group_users_managed_by_idx').execute();
  await db.schema.alterTable('group_users').dropColumn('managed_by').execute();
  await db.schema.dropIndex('groups_workspace_external_team_unique').execute();
  await db.schema
    .alterTable('groups')
    .dropColumn('external_orphaned_at')
    .execute();
  await db.schema
    .alterTable('groups')
    .dropColumn('external_team_role')
    .execute();
  await db.schema
    .alterTable('groups')
    .dropColumn('external_team_id')
    .execute();
}
