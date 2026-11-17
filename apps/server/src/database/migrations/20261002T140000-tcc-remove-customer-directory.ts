import { Kysely, sql } from 'kysely';

/**
 * TCC — remove os restos do diretório externo (diretório externo de
 * clientes e organizações), que o TCC não usa.
 *
 * - `pages.customer_key` e o índice `pages_customer_key_idx` (cliente da
 *   página, escolhido a partir do Directory);
 * - `customer_directory_projections` (cópia local dos clientes do Directory);
 * - `workspaces.directory_organization_key` e o índice dela;
 * - o tipo `customer` das propriedades de página: definições desse tipo e os
 *   valores delas são apagados e a constraint volta a aceitar só
 *   `date`, `number` e `person`.
 *
 * Irreversível de propósito: não há fonte para reconstruir esses dados.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DELETE FROM page_property_values
    WHERE property_id IN (
      SELECT id FROM page_property_definitions WHERE type = 'customer'
    )
  `.execute(db);
  await sql`DELETE FROM page_property_definitions WHERE type = 'customer'`.execute(
    db,
  );
  await sql`
    ALTER TABLE page_property_definitions
      DROP CONSTRAINT IF EXISTS page_property_definitions_type_check
  `.execute(db);
  await sql`
    ALTER TABLE page_property_definitions
      ADD CONSTRAINT page_property_definitions_type_check
      CHECK (type IN ('date', 'number', 'person'))
  `.execute(db);

  await sql`DROP INDEX IF EXISTS pages_customer_key_idx`.execute(db);
  await sql`ALTER TABLE pages DROP COLUMN IF EXISTS customer_key`.execute(db);
  await sql`DROP TABLE IF EXISTS customer_directory_projections`.execute(db);

  await sql`DROP INDEX IF EXISTS workspaces_directory_organization_key_idx`.execute(
    db,
  );
  await sql`ALTER TABLE workspaces DROP COLUMN IF EXISTS directory_organization_key`.execute(
    db,
  );
}

export async function down(): Promise<void> {
  // Intencionalmente irreversível: o TCC não usa o diretório externo.
}
