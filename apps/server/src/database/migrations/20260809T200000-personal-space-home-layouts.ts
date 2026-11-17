import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE space_home_layouts
      DROP CONSTRAINT space_home_layouts_space_id_key
  `.execute(db);

  await db.schema
    .alterTable('space_home_layouts')
    .addColumn('user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('cascade'),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX space_home_layouts_shared_unique
      ON space_home_layouts (space_id)
      WHERE user_id IS NULL
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX space_home_layouts_personal_unique
      ON space_home_layouts (space_id, user_id)
      WHERE user_id IS NOT NULL
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  // The old schema can represent only the shared row.
  await sql`DELETE FROM space_home_layouts WHERE user_id IS NOT NULL`.execute(
    db,
  );
  await sql`DROP INDEX space_home_layouts_personal_unique`.execute(db);
  await sql`DROP INDEX space_home_layouts_shared_unique`.execute(db);

  await db.schema
    .alterTable('space_home_layouts')
    .dropColumn('user_id')
    .execute();

  await db.schema
    .alterTable('space_home_layouts')
    .addUniqueConstraint('space_home_layouts_space_id_key', ['space_id'])
    .execute();
}
