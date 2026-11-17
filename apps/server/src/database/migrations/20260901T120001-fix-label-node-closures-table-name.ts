import { type Kysely, sql } from 'kysely';

/**
 * The taxonomy migration originally created the closure table in the singular
 * form, while Kysely's logical `labelNodeClosures` table maps to the plural
 * `label_node_closures` relation. Normalize existing databases without
 * recreating or copying any closure rows.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    DECLARE
      legacy_exists boolean;
      canonical_exists boolean;
      required_column_count integer;
    BEGIN
      SELECT to_regclass('public.label_node_closure') IS NOT NULL
        INTO legacy_exists;
      SELECT to_regclass('public.label_node_closures') IS NOT NULL
        INTO canonical_exists;

      IF legacy_exists AND canonical_exists THEN
        RAISE EXCEPTION 'Both label closure tables exist; manual reconciliation is required';
      ELSIF NOT legacy_exists AND NOT canonical_exists THEN
        RAISE EXCEPTION 'No label closure table exists; the taxonomy migration is incomplete';
      ELSIF legacy_exists THEN
        ALTER TABLE label_node_closure RENAME TO label_node_closures;
      END IF;

      SELECT count(*)
        INTO required_column_count
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'label_node_closures'
        AND column_name IN ('tree_id', 'ancestor_id', 'descendant_id', 'depth');

      IF required_column_count <> 4 THEN
        RAISE EXCEPTION
          'The label_node_closures table is missing one or more required columns: tree_id, ancestor_id, descendant_id, depth';
      END IF;
    END
    $$;
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`
    DO $$
    DECLARE
      legacy_exists boolean;
      canonical_exists boolean;
    BEGIN
      SELECT to_regclass('public.label_node_closure') IS NOT NULL
        INTO legacy_exists;
      SELECT to_regclass('public.label_node_closures') IS NOT NULL
        INTO canonical_exists;

      IF legacy_exists AND canonical_exists THEN
        RAISE EXCEPTION 'Both label closure tables exist; manual reconciliation is required';
      ELSIF NOT legacy_exists AND NOT canonical_exists THEN
        RAISE EXCEPTION 'No label closure table exists; cannot roll back table rename';
      ELSIF canonical_exists THEN
        ALTER TABLE label_node_closures RENAME TO label_node_closure;
      END IF;
    END
    $$;
  `.execute(db);
}
