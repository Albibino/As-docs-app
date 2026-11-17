import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('customer_key', 'varchar')
    .execute();

  await db.schema
    .createIndex('pages_customer_key_idx')
    .on('pages')
    .column('customer_key')
    .where(sql<boolean>`customer_key is not null`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropIndex('pages_customer_key_idx').ifExists().execute();
  await db.schema.alterTable('pages').dropColumn('customer_key').execute();
}
