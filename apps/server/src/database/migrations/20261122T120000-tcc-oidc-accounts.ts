import { Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('oidc_accounts')
    .addColumn('issuer', 'text', (column) => column.notNull())
    .addColumn('subject', 'text', (column) => column.notNull())
    .addColumn('user_id', 'uuid', (column) =>
      column.notNull().references('users.id').onDelete('cascade'),
    )
    .addPrimaryKeyConstraint('oidc_accounts_identity', ['issuer', 'subject'])
    .addUniqueConstraint('oidc_accounts_local_user', ['issuer', 'user_id'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('oidc_accounts').execute();
}
