import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('users')
    .addColumn('clerk_user_id', 'varchar')
    .execute();

  await db.schema
    .createIndex('idx_users_workspace_clerk_user_id_unique')
    .on('users')
    .columns(['workspace_id', 'clerk_user_id'])
    .where('clerk_user_id', 'is not', null)
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropIndex('idx_users_workspace_clerk_user_id_unique')
    .execute();

  await db.schema.alterTable('users').dropColumn('clerk_user_id').execute();
}
