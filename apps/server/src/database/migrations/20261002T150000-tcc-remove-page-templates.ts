import { Kysely, sql } from 'kysely';

/**
 * TCC — remove os modelos de página ("templates").
 *
 * - `favorites`: apaga favoritos de modelo, o índice e a coluna `template_id`;
 * - `template_required_groups` e `template_labels` (labels aplicadas por
 *   modelo), com o gatilho e a função que sincronizavam `label_tree_id`;
 * - `templates`, com o gatilho de busca e a função dele;
 * - a chave `templates` das configurações do workspace
 *   (`allowMemberTemplates`).
 *
 * Irreversível de propósito: o TCC não usa modelos de página.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DELETE FROM favorites WHERE type = 'template' OR template_id IS NOT NULL`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS idx_favorites_user_template`.execute(db);
  await sql`ALTER TABLE favorites DROP COLUMN IF EXISTS template_id`.execute(db);

  await sql`DROP TABLE IF EXISTS template_required_groups`.execute(db);
  await sql`DROP TRIGGER IF EXISTS template_labels_sync_tree_id ON template_labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_template_label_tree_id()`.execute(db);
  await sql`DROP TABLE IF EXISTS template_labels`.execute(db);

  await sql`DROP TRIGGER IF EXISTS templates_tsvector_update ON templates`.execute(db);
  await sql`DROP FUNCTION IF EXISTS templates_tsvector_trigger()`.execute(db);
  await sql`DROP TABLE IF EXISTS templates`.execute(db);

  await sql`UPDATE workspaces SET settings = settings - 'templates' WHERE settings ? 'templates'`.execute(
    db,
  );
}

export async function down(): Promise<void> {
  // Intencionalmente irreversível: o TCC não usa modelos de página.
}
