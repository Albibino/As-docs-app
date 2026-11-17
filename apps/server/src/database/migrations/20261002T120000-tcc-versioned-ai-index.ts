import { Kysely, sql } from 'kysely';

/**
 * TCC — base da indexação versionada e cortes de funcionalidade.
 *
 * 1. `pages.content_version`: versão monotônica do documento. Um trigger a
 *    incrementa em TODA alteração de título, conteúdo ou exclusão, qualquer que
 *    seja o caminho de escrita (colaboração em tempo real, REST, restauração,
 *    lixeira). A IA considera sempre a maior versão como a atual.
 * 2. `pages.ai_indexed_version`: a maior versão que o tcc-docs-ai confirmou ter
 *    no índice vetorial. Só cresce. A diferença entre as duas colunas é
 *    exatamente o "documento desatualizado no banco vetorial".
 * 3. Publicação de páginas, compartilhamento público e convites foram removidos
 *    do produto; suas tabelas e a coluna de revisão publicada saem junto.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    ALTER TABLE pages
      ADD COLUMN IF NOT EXISTS content_version integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS ai_indexed_version integer NOT NULL DEFAULT 0
  `.execute(db);

  await sql`
    CREATE OR REPLACE FUNCTION pages_bump_content_version() RETURNS trigger AS $$
    BEGIN
      IF NEW.title IS DISTINCT FROM OLD.title
         OR NEW.content IS DISTINCT FROM OLD.content
         OR NEW.deleted_at IS DISTINCT FROM OLD.deleted_at THEN
        NEW.content_version := OLD.content_version + 1;
      ELSE
        -- Nenhum outro caminho pode mexer na versão: ela só anda pelo trigger.
        NEW.content_version := OLD.content_version;
      END IF;
      -- O marcador de indexação nunca regride.
      IF NEW.ai_indexed_version < OLD.ai_indexed_version THEN
        NEW.ai_indexed_version := OLD.ai_indexed_version;
      END IF;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `.execute(db);

  await sql`DROP TRIGGER IF EXISTS pages_content_version_trigger ON pages`.execute(
    db,
  );
  await sql`
    CREATE TRIGGER pages_content_version_trigger
    BEFORE UPDATE ON pages
    FOR EACH ROW EXECUTE FUNCTION pages_bump_content_version()
  `.execute(db);

  await sql`
    CREATE INDEX IF NOT EXISTS pages_ai_index_pending_idx
      ON pages (workspace_id)
      WHERE ai_indexed_version < content_version
  `.execute(db);

  // --- cortes ---------------------------------------------------------------
  await sql`DROP INDEX IF EXISTS pages_published_revision_id_idx`.execute(db);
  await sql`ALTER TABLE pages DROP COLUMN IF EXISTS published_revision_id`.execute(
    db,
  );
  await sql`DROP TABLE IF EXISTS page_publications`.execute(db);
  await sql`DROP TABLE IF EXISTS shares`.execute(db);
  await sql`DROP TABLE IF EXISTS workspace_invitations`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS pages_content_version_trigger ON pages`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS pages_bump_content_version()`.execute(db);
  await sql`DROP INDEX IF EXISTS pages_ai_index_pending_idx`.execute(db);
  await sql`
    ALTER TABLE pages
      DROP COLUMN IF EXISTS ai_indexed_version,
      DROP COLUMN IF EXISTS content_version
  `.execute(db);
  // Publicação, compartilhamento e convites não são recriados: o TCC não os usa.
}
