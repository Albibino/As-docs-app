import { Kysely, sql } from 'kysely';

/**
 * TCC — remove a personalização da home do space.
 *
 * A home do space passa a ser fixa (título, descrição e as páginas do space),
 * sem layouts por usuário ("Personalizar para mim") nem da equipe
 * ("Personalizar home da equipe"). Apaga a tabela `space_home_layouts`, com
 * os índices dela.
 *
 * O índice `idx_pages_last_updated_by_recent`, criado na mesma migração que a
 * tabela, continua: ele atende o histórico do cabeçalho.
 *
 * Irreversível de propósito: o TCC não personaliza a home do space.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`DROP TABLE IF EXISTS space_home_layouts`.execute(db);
}

export async function down(): Promise<void> {
  // Intencionalmente irreversível: o TCC não personaliza a home do space.
}
