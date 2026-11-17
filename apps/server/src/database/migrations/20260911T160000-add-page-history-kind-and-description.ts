import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createType('page_history_kind')
    .asEnum(['automatic', 'manual'])
    .execute();

  await db.schema
    .alterTable('page_history')
    .addColumn('kind', sql`page_history_kind`, (col) =>
      col.notNull().defaultTo('automatic'),
    )
    .addColumn('description', 'varchar')
    .execute();

  await sql`
    UPDATE page_history
    SET kind = 'automatic'
    WHERE kind IS NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_history')
    .dropColumn('description')
    .dropColumn('kind')
    .execute();

  await db.schema.dropType('page_history_kind').execute();
}
