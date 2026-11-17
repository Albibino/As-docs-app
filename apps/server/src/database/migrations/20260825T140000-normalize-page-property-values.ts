import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE page_property_definitions
    SET config = CASE
      WHEN pg_input_is_valid(config #>> '{}', 'jsonb')
        THEN (config #>> '{}')::jsonb
      ELSE config
    END
    WHERE jsonb_typeof(config) = 'string'
  `.execute(db);

  await sql`
    UPDATE page_property_values
    SET value = CASE
      WHEN pg_input_is_valid(value #>> '{}', 'jsonb')
        THEN (value #>> '{}')::jsonb
      ELSE value
    END
    WHERE jsonb_typeof(value) = 'string'
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE page_property_values
    SET value = to_jsonb(value::text)
    WHERE jsonb_typeof(value) <> 'string'
  `.execute(db);
}
