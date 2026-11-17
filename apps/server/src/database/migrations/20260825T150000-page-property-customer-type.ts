import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_property_definitions')
    .dropConstraint('page_property_definitions_type_check')
    .execute();
  await db.schema
    .alterTable('page_property_definitions')
    .addCheckConstraint(
      'page_property_definitions_type_check',
      sql`type IN ('date', 'number', 'person', 'customer')`,
    )
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('page_property_definitions')
    .dropConstraint('page_property_definitions_type_check')
    .execute();
  await db.schema
    .alterTable('page_property_definitions')
    .addCheckConstraint(
      'page_property_definitions_type_check',
      sql`type IN ('date', 'number', 'person')`,
    )
    .execute();
}
