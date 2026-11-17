import { Kysely, sql } from 'kysely';

/**
 * TCC — remove os módulos opcionais billing, cloud, MFA, SCIM, auditoria
 * genérica e chaves de API.
 *
 * - `billing` (assinaturas Stripe) e as colunas de cobrança/nuvem do
 *   workspace: `stripe_customer_id`, `billing_email`, `trial_end_at`;
 * - `user_mfa` e `workspaces.enforce_mfa`;
 * - `scim_tokens`, `workspaces.is_scim_enabled` e `scim_external_id` em
 *   `users` e `groups` (com os índices parciais);
 * - `api_keys` e a chave `api` (restrictToAdmins) das configurações do
 *   workspace;
 * - `workspaces.audit_retention_days`. A tabela `audit` continua: ela guarda
 *   o histórico de labels mostrado no painel de detalhes da página.
 *
 * `workspaces.plan`, `status` e `hostname` ficam: o seed e o cálculo de
 * licença ainda os leem.
 *
 * Irreversível de propósito: o TCC não usa esses módulos.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS billing`.execute(db);
  await sql`DROP TABLE IF EXISTS user_mfa`.execute(db);
  await sql`DROP TABLE IF EXISTS scim_tokens`.execute(db);
  await sql`DROP TABLE IF EXISTS api_keys`.execute(db);

  await sql`DROP INDEX IF EXISTS idx_users_workspace_scim_external_id`.execute(db);
  await sql`ALTER TABLE users DROP COLUMN IF EXISTS scim_external_id`.execute(db);
  await sql`DROP INDEX IF EXISTS idx_groups_workspace_scim_external_id`.execute(db);
  await sql`ALTER TABLE IF EXISTS groups DROP COLUMN IF EXISTS scim_external_id`.execute(
    db,
  );

  await sql`
    ALTER TABLE workspaces
      DROP COLUMN IF EXISTS stripe_customer_id,
      DROP COLUMN IF EXISTS billing_email,
      DROP COLUMN IF EXISTS trial_end_at,
      DROP COLUMN IF EXISTS enforce_mfa,
      DROP COLUMN IF EXISTS is_scim_enabled,
      DROP COLUMN IF EXISTS audit_retention_days
  `.execute(db);

  await sql`UPDATE workspaces SET settings = settings - 'api' WHERE settings ? 'api'`.execute(
    db,
  );
}

export async function down(): Promise<void> {
  // Intencionalmente irreversível: o TCC não usa esses módulos.
}
