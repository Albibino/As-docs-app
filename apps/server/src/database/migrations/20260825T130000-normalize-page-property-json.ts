import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE page_property_definitions
    SET config = (config #>> '{}')::jsonb
    WHERE jsonb_typeof(config) = 'string'
  `.execute(db);

  await sql`
    UPDATE page_property_values
    SET value = (value #>> '{}')::jsonb
    WHERE jsonb_typeof(value) = 'string'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE page_property_definitions
    SET config = to_jsonb(config::text)
    WHERE jsonb_typeof(config) <> 'string'
  `.execute(db);

  await sql`
    UPDATE page_property_values
    SET value = to_jsonb(value::text)
    WHERE jsonb_typeof(value) <> 'string'
  `.execute(db);
}
