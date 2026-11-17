import { Kysely, sql } from 'kysely';

// base_views.config was written with JSON.stringify through the postgres.js
// driver, which encodes a string parameter as a JSON string. Every row landed
// as "{\"groupByPropertyId\":...}" instead of an object, so clients read
// config as text and every saved setting (group by, calendar date property,
// filters, sorts, widths) was silently ignored. Unwrap the stored strings.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE base_views
    SET config = (config #>> '{}')::jsonb
    WHERE jsonb_typeof(config) = 'string'
      AND (config #>> '{}') IS JSON OBJECT
  `.execute(db);
}

export async function down(): Promise<void> {
  // Re-encoding valid objects back into JSON strings would restore the bug.
}
