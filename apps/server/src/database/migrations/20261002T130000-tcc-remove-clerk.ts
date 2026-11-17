import { Kysely, sql } from 'kysely';

/**
 * TCC — remove tudo o que pertencia ao Clerk.
 *
 * O login foi substituído pela escolha entre os dois usuários fixos (ver
 * docs/tcc/03-decisoes.md, D1) e o Clerk não será usado. Saem:
 * - `users.clerk_user_id` e o índice único `(workspace_id, clerk_user_id)`;
 * - `workspaces.clerk_organization_id`;
 * - as projeções que espelhavam identidades e organizações do Clerk via
 *   diretório externo (`principal_profile_projections`,
 *   `organization_access_projections`) e o registro de eventos dessa
 *   sincronização (`directory_event_receipts`).
 *
 * As migrações antigas que criaram esses objetos ficam intactas: já foram
 * aplicadas em bancos existentes e o histórico do Kysely depende delas.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP INDEX IF EXISTS idx_users_workspace_clerk_user_id_unique`.execute(
    db,
  );
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS clerk_user_id`.execute(db);
  await sql`ALTER TABLE workspaces DROP COLUMN IF EXISTS clerk_organization_id`.execute(
    db,
  );
  await sql`DROP TABLE IF EXISTS principal_profile_projections`.execute(db);
  await sql`DROP TABLE IF EXISTS organization_access_projections`.execute(db);
  await sql`DROP TABLE IF EXISTS directory_event_receipts`.execute(db);
}

export async function down(): Promise<void> {
  // Intencionalmente irreversível: o TCC não usa Clerk.
}
