import { Kysely, sql } from 'kysely';

// space_home_layouts.layout was written with JSON.stringify through the
// postgres.js driver, which encodes a string parameter as a JSON string. Rows
// landed as "{\"version\":1,...}" instead of an object, so the layout failed
// schema validation on read and every customized space home fell back to the
// implicit default. Unwrap the stored strings.
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    UPDATE space_home_layouts
    SET layout = (layout #>> '{}')::jsonb
    WHERE jsonb_typeof(layout) = 'string'
      AND (layout #>> '{}') IS JSON OBJECT
  `.execute(db);
}

export async function down(): Promise<void> {
  // Re-encoding valid objects back into JSON strings would restore the bug.
}
