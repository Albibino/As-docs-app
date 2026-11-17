import { type Kysely, sql } from 'kysely';

type MigrationCounts = {
  trees: string;
  groupedLabels: string;
  freeLabels: string;
  pageLabels: string;
  templateLabels: string;
};

/**
 * Replace flat label groups with first-class taxonomy trees.
 *
 * The application and this migration are deployed together. Existing group
 * and label ids are retained: a group becomes a tree and every grouped label
 * becomes a root node. Ungrouped labels remain free tags.
 */
export async function up(db: Kysely<any>): Promise<void> {
  const before = await getMigrationCounts(db, 'label_groups', 'group_id');

  await sql`DROP TRIGGER IF EXISTS labels_sync_assignment_group_ids ON labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_label_assignment_group_ids()`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS page_labels_sync_group_id ON page_labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_page_label_group_id()`.execute(db);

  await sql`ALTER TABLE label_groups RENAME TO label_trees`.execute(db);
  await sql`ALTER TABLE labels RENAME COLUMN group_id TO tree_id`.execute(db);
  await sql`ALTER TABLE page_labels RENAME COLUMN label_group_id TO label_tree_id`.execute(
    db,
  );

  await sql`
    ALTER TABLE labels
      ADD COLUMN kind varchar NOT NULL DEFAULT 'label',
      ADD COLUMN parent_id uuid
  `.execute(db);

  await sql`
    ALTER TABLE labels
      ADD CONSTRAINT labels_node_kind_check
        CHECK (kind IN ('group', 'label')),
      ADD CONSTRAINT labels_parent_requires_tree_check
        CHECK (parent_id IS NULL OR tree_id IS NOT NULL),
      ADD CONSTRAINT labels_tree_id_id_unique
        UNIQUE (tree_id, id),
      ADD CONSTRAINT labels_parent_tree_fkey
        FOREIGN KEY (tree_id, parent_id)
        REFERENCES labels (tree_id, id)
        ON DELETE CASCADE
  `.execute(db);

  await sql`DROP INDEX IF EXISTS label_groups_workspace_slug_unique`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS label_groups_space_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS label_groups_workspace_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS label_groups_space_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_workspace_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_space_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_group_id_idx`.execute(db);

  await sql`
    CREATE UNIQUE INDEX label_trees_workspace_slug_unique
      ON label_trees (workspace_id, slug) WHERE space_id IS NULL;
    CREATE UNIQUE INDEX label_trees_space_slug_unique
      ON label_trees (space_id, slug) WHERE space_id IS NOT NULL;
    CREATE INDEX label_trees_workspace_id_idx ON label_trees (workspace_id);
    CREATE INDEX label_trees_space_id_idx ON label_trees (space_id);
    CREATE UNIQUE INDEX labels_workspace_free_slug_unique
      ON labels (workspace_id, slug)
      WHERE space_id IS NULL AND tree_id IS NULL;
    CREATE UNIQUE INDEX labels_space_free_slug_unique
      ON labels (space_id, slug)
      WHERE space_id IS NOT NULL AND tree_id IS NULL;
    CREATE UNIQUE INDEX labels_tree_root_slug_unique
      ON labels (tree_id, slug)
      WHERE tree_id IS NOT NULL AND parent_id IS NULL;
    CREATE UNIQUE INDEX labels_tree_parent_slug_unique
      ON labels (tree_id, parent_id, slug)
      WHERE tree_id IS NOT NULL AND parent_id IS NOT NULL;
    CREATE INDEX labels_tree_id_parent_id_position_idx
      ON labels (tree_id, parent_id, position, name);
  `.execute(db);

  await sql`
    CREATE TABLE label_node_closure (
      tree_id uuid NOT NULL REFERENCES label_trees(id) ON DELETE CASCADE,
      ancestor_id uuid NOT NULL,
      descendant_id uuid NOT NULL,
      depth integer NOT NULL,
      PRIMARY KEY (tree_id, ancestor_id, descendant_id),
      FOREIGN KEY (tree_id, ancestor_id)
        REFERENCES labels (tree_id, id) ON DELETE CASCADE,
      FOREIGN KEY (tree_id, descendant_id)
        REFERENCES labels (tree_id, id) ON DELETE CASCADE,
      CONSTRAINT label_node_closure_depth_non_negative_check
        CHECK (depth >= 0),
      CONSTRAINT label_node_closure_depth_check
        CHECK ((depth = 0) = (ancestor_id = descendant_id))
    )
  `.execute(db);

  await sql`
    INSERT INTO label_node_closure (tree_id, ancestor_id, descendant_id, depth)
    SELECT tree_id, id, id, 0
    FROM labels
    WHERE tree_id IS NOT NULL
  `.execute(db);

  await sql`
    CREATE INDEX label_node_closure_ancestor_idx
      ON label_node_closure (tree_id, ancestor_id, depth, descendant_id);
    CREATE INDEX label_node_closure_descendant_idx
      ON label_node_closure (tree_id, descendant_id, depth, ancestor_id);
  `.execute(db);

  // The service locks the tree while maintaining the closure rows, while
  // this trigger keeps direct SQL writes from introducing a cycle.
  await sql`
    CREATE FUNCTION validate_label_parent() RETURNS trigger AS $$
    BEGIN
      IF NEW.parent_id IS NULL THEN
        RETURN NEW;
      END IF;

      IF NEW.parent_id = NEW.id OR EXISTS (
        WITH RECURSIVE ancestors(id) AS (
          SELECT parent_id
          FROM labels
          WHERE id = NEW.parent_id
          UNION ALL
          SELECT labels.parent_id
          FROM labels
          INNER JOIN ancestors ON ancestors.id = labels.id
          WHERE labels.parent_id IS NOT NULL
        )
        SELECT 1 FROM ancestors WHERE id = NEW.id
      ) THEN
        RAISE EXCEPTION 'A label node cannot be moved below its descendant'
          USING ERRCODE = '23514';
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER labels_validate_parent
      BEFORE INSERT OR UPDATE OF parent_id ON labels
      FOR EACH ROW EXECUTE FUNCTION validate_label_parent()
  `.execute(db);

  await sql`ALTER TABLE page_labels ALTER COLUMN label_id DROP NOT NULL`.execute(
    db,
  );
  await sql`
    ALTER TABLE page_labels
      ADD CONSTRAINT page_labels_assignment_shape_check
        CHECK (label_tree_id IS NOT NULL OR label_id IS NOT NULL)
  `.execute(db);
  await sql`DROP INDEX IF EXISTS page_labels_page_group_unique`.execute(db);
  await sql`
    CREATE UNIQUE INDEX page_labels_page_tree_unique
      ON page_labels (page_id, label_tree_id)
      WHERE label_tree_id IS NOT NULL;
    CREATE INDEX page_labels_label_tree_id_idx
      ON page_labels (label_tree_id)
  `.execute(db);

  await sql`
    CREATE FUNCTION sync_page_label_tree_id() RETURNS trigger AS $$
    DECLARE
      derived_tree_id uuid;
    BEGIN
      IF NEW.label_id IS NULL THEN
        IF NEW.label_tree_id IS NULL THEN
          RAISE EXCEPTION 'A taxonomy selection requires a tree'
            USING ERRCODE = '23514';
        END IF;
        IF NOT EXISTS (SELECT 1 FROM label_trees WHERE id = NEW.label_tree_id) THEN
          RAISE EXCEPTION 'The selected label tree does not exist'
            USING ERRCODE = '23503';
        END IF;
        RETURN NEW;
      END IF;

      SELECT tree_id INTO derived_tree_id
      FROM labels
      WHERE id = NEW.label_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected label does not exist'
          USING ERRCODE = '23503';
      END IF;

      IF derived_tree_id IS DISTINCT FROM NEW.label_tree_id THEN
        IF derived_tree_id IS NULL AND NEW.label_tree_id IS NOT NULL THEN
          RAISE EXCEPTION 'A free tag cannot be assigned to a label tree'
            USING ERRCODE = '23514';
        END IF;
        IF derived_tree_id IS NOT NULL AND NEW.label_tree_id IS NULL THEN
          NEW.label_tree_id := derived_tree_id;
        ELSE
          RAISE EXCEPTION 'The label does not belong to the selected tree'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER page_labels_sync_tree_id
      BEFORE INSERT OR UPDATE OF label_id, label_tree_id ON page_labels
      FOR EACH ROW EXECUTE FUNCTION sync_page_label_tree_id()
  `.execute(db);

  await sql`
    ALTER TABLE template_labels
      ADD COLUMN label_tree_id uuid REFERENCES label_trees(id) ON DELETE CASCADE
  `.execute(db);
  await sql`
    UPDATE template_labels AS tl
    SET label_tree_id = labels.tree_id
    FROM labels
    WHERE labels.id = tl.label_id
  `.execute(db);
  await sql`ALTER TABLE template_labels ALTER COLUMN label_id DROP NOT NULL`.execute(
    db,
  );
  await sql`
    ALTER TABLE template_labels
      ADD CONSTRAINT template_labels_assignment_shape_check
        CHECK (label_tree_id IS NOT NULL OR label_id IS NOT NULL)
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX template_labels_template_tree_unique
      ON template_labels (template_id, label_tree_id)
      WHERE label_tree_id IS NOT NULL;
    CREATE INDEX template_labels_label_tree_id_idx
      ON template_labels (label_tree_id)
  `.execute(db);
  await sql`
    CREATE FUNCTION sync_template_label_tree_id() RETURNS trigger AS $$
    DECLARE
      derived_tree_id uuid;
    BEGIN
      IF NEW.label_id IS NULL THEN
        IF NEW.label_tree_id IS NULL THEN
          RAISE EXCEPTION 'A taxonomy selection requires a tree'
            USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
      END IF;

      SELECT tree_id INTO derived_tree_id
      FROM labels
      WHERE id = NEW.label_id
      FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'The selected label does not exist'
          USING ERRCODE = '23503';
      END IF;

      IF derived_tree_id IS DISTINCT FROM NEW.label_tree_id THEN
        IF derived_tree_id IS NULL AND NEW.label_tree_id IS NOT NULL THEN
          RAISE EXCEPTION 'A free tag cannot be assigned to a label tree'
            USING ERRCODE = '23514';
        END IF;
        IF derived_tree_id IS NOT NULL AND NEW.label_tree_id IS NULL THEN
          NEW.label_tree_id := derived_tree_id;
        ELSE
          RAISE EXCEPTION 'The label does not belong to the selected tree'
            USING ERRCODE = '23514';
        END IF;
      END IF;

      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER template_labels_sync_tree_id
      BEFORE INSERT OR UPDATE OF label_id, label_tree_id ON template_labels
      FOR EACH ROW EXECUTE FUNCTION sync_template_label_tree_id()
  `.execute(db);

  // Declare this trigger after both assignment tables have their denormalized
  // tree column. PostgreSQL compiles PL/pgSQL bodies lazily, but keeping the
  // schema dependency explicit also makes migration runners and schema checks
  // deterministic.
  await sql`
    CREATE FUNCTION sync_label_assignment_tree_ids() RETURNS trigger AS $$
    BEGIN
      UPDATE page_labels
      SET label_tree_id = NEW.tree_id
      WHERE label_id = NEW.id
        AND label_tree_id IS DISTINCT FROM NEW.tree_id;
      UPDATE template_labels
      SET label_tree_id = NEW.tree_id
      WHERE label_id = NEW.id
        AND label_tree_id IS DISTINCT FROM NEW.tree_id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER labels_sync_assignment_tree_ids
      AFTER UPDATE OF tree_id ON labels
      FOR EACH ROW
      WHEN (OLD.tree_id IS DISTINCT FROM NEW.tree_id)
      EXECUTE FUNCTION sync_label_assignment_tree_ids()
  `.execute(db);

  await sql`DROP TABLE template_required_groups`.execute(db);
  await sql`ALTER TABLE pages DROP COLUMN required_label_group_ids`.execute(db);

  const after = await getMigrationCounts(db, 'label_trees', 'tree_id');
  assertCount(after.trees, before.trees, 'label trees');
  assertCount(after.groupedLabels, before.groupedLabels, 'taxonomy nodes');
  assertCount(after.freeLabels, before.freeLabels, 'free tags');
  assertCount(after.pageLabels, before.pageLabels, 'page label assignments');
  assertCount(
    after.templateLabels,
    before.templateLabels,
    'template label assignments',
  );
}

export async function down(db: Kysely<any>): Promise<void> {
  const state = await sql<{ hasHierarchy: boolean }>`
    SELECT (
      EXISTS (SELECT 1 FROM labels WHERE parent_id IS NOT NULL OR kind = 'group')
      OR EXISTS (SELECT 1 FROM label_node_closure WHERE depth > 0)
      OR EXISTS (SELECT 1 FROM page_labels WHERE label_id IS NULL)
      OR EXISTS (SELECT 1 FROM template_labels WHERE label_id IS NULL)
      OR EXISTS (
        SELECT 1
        FROM labels
        GROUP BY workspace_id, space_id, slug
        HAVING count(*) > 1
      )
    ) AS "hasHierarchy"
  `.execute(db);

  if (state.rows[0]?.hasHierarchy) {
    throw new Error(
      'Refusing to flatten hierarchical label data; restore the database snapshot instead',
    );
  }

  await sql`DROP TRIGGER IF EXISTS labels_sync_assignment_tree_ids ON labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_label_assignment_tree_ids()`.execute(
    db,
  );
  await sql`DROP TRIGGER IF EXISTS labels_validate_parent ON labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS validate_label_parent()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS page_labels_sync_tree_id ON page_labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_page_label_tree_id()`.execute(db);
  await sql`DROP TRIGGER IF EXISTS template_labels_sync_tree_id ON template_labels`.execute(
    db,
  );
  await sql`DROP FUNCTION IF EXISTS sync_template_label_tree_id()`.execute(db);

  // The closure foreign keys depend on labels(tree_id, id). Remove the
  // closure table before dropping that composite key while rolling back.
  await sql`DROP INDEX IF EXISTS label_node_closure_ancestor_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS label_node_closure_descendant_idx`.execute(db);
  await sql`DROP TABLE label_node_closure`.execute(db);

  await sql`ALTER TABLE template_labels DROP CONSTRAINT template_labels_assignment_shape_check`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS template_labels_template_tree_unique`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS template_labels_label_tree_id_idx`.execute(db);
  await sql`ALTER TABLE template_labels DROP COLUMN label_tree_id`.execute(db);
  await sql`ALTER TABLE template_labels ALTER COLUMN label_id SET NOT NULL`.execute(
    db,
  );

  await sql`ALTER TABLE page_labels DROP CONSTRAINT page_labels_assignment_shape_check`.execute(
    db,
  );
  await sql`DROP INDEX IF EXISTS page_labels_page_tree_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS page_labels_label_tree_id_idx`.execute(db);
  await sql`ALTER TABLE page_labels RENAME COLUMN label_tree_id TO label_group_id`.execute(
    db,
  );
  await sql`ALTER TABLE page_labels ALTER COLUMN label_id SET NOT NULL`.execute(
    db,
  );
  await sql`
    CREATE UNIQUE INDEX page_labels_page_group_unique
      ON page_labels (page_id, label_group_id)
      WHERE label_group_id IS NOT NULL
  `.execute(db);

  await sql`DROP INDEX IF EXISTS labels_workspace_free_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_space_free_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_tree_root_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_tree_parent_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS labels_tree_id_parent_id_position_idx`.execute(
    db,
  );
  await sql`ALTER TABLE labels DROP CONSTRAINT labels_parent_tree_fkey`.execute(
    db,
  );
  await sql`ALTER TABLE labels DROP CONSTRAINT labels_tree_id_id_unique`.execute(
    db,
  );
  await sql`ALTER TABLE labels DROP CONSTRAINT labels_parent_requires_tree_check`.execute(
    db,
  );
  await sql`ALTER TABLE labels DROP CONSTRAINT labels_node_kind_check`.execute(
    db,
  );
  await sql`ALTER TABLE labels RENAME COLUMN tree_id TO group_id`.execute(db);
  await sql`ALTER TABLE labels DROP COLUMN parent_id, DROP COLUMN kind`.execute(
    db,
  );

  await sql`DROP INDEX IF EXISTS label_trees_workspace_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS label_trees_space_slug_unique`.execute(db);
  await sql`DROP INDEX IF EXISTS label_trees_workspace_id_idx`.execute(db);
  await sql`DROP INDEX IF EXISTS label_trees_space_id_idx`.execute(db);
  await sql`ALTER TABLE label_trees RENAME TO label_groups`.execute(db);
  await sql`
    CREATE UNIQUE INDEX label_groups_workspace_slug_unique
      ON label_groups (workspace_id, slug) WHERE space_id IS NULL;
    CREATE UNIQUE INDEX label_groups_space_slug_unique
      ON label_groups (space_id, slug) WHERE space_id IS NOT NULL;
    CREATE INDEX label_groups_workspace_id_idx ON label_groups (workspace_id);
    CREATE INDEX label_groups_space_id_idx ON label_groups (space_id);
    CREATE UNIQUE INDEX labels_workspace_slug_unique
      ON labels (workspace_id, slug) WHERE space_id IS NULL;
    CREATE UNIQUE INDEX labels_space_slug_unique
      ON labels (space_id, slug) WHERE space_id IS NOT NULL;
    CREATE INDEX labels_group_id_idx ON labels (group_id);
  `.execute(db);

  await sql`
    ALTER TABLE pages
      ADD COLUMN required_label_group_ids uuid[]
  `.execute(db);
  await sql`
    CREATE TABLE template_required_groups (
      id uuid PRIMARY KEY DEFAULT gen_uuid_v7(),
      template_id uuid NOT NULL REFERENCES templates(id) ON DELETE CASCADE,
      label_group_id uuid NOT NULL REFERENCES label_groups(id) ON DELETE CASCADE,
      created_at timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT template_required_groups_unique
        UNIQUE (template_id, label_group_id)
    )
  `.execute(db);
  await sql`
    CREATE INDEX template_required_groups_template_id_idx
      ON template_required_groups (template_id);
    CREATE INDEX template_required_groups_label_group_id_idx
      ON template_required_groups (label_group_id)
  `.execute(db);
  await sql`
    CREATE FUNCTION sync_page_label_group_id() RETURNS trigger AS $$
    BEGIN
      SELECT group_id INTO NEW.label_group_id
      FROM labels
      WHERE id = NEW.label_id
      FOR UPDATE;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER page_labels_sync_group_id
      BEFORE INSERT OR UPDATE OF label_id, label_group_id ON page_labels
      FOR EACH ROW EXECUTE FUNCTION sync_page_label_group_id()
  `.execute(db);
  await sql`
    CREATE FUNCTION sync_label_assignment_group_ids() RETURNS trigger AS $$
    BEGIN
      UPDATE page_labels
      SET label_group_id = NEW.group_id
      WHERE label_id = NEW.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER labels_sync_assignment_group_ids
      AFTER UPDATE OF group_id ON labels
      FOR EACH ROW
      WHEN (OLD.group_id IS DISTINCT FROM NEW.group_id)
      EXECUTE FUNCTION sync_label_assignment_group_ids()
  `.execute(db);
}

async function getMigrationCounts(
  db: Kysely<any>,
  treeTable: 'label_groups' | 'label_trees',
  labelTreeColumn: 'group_id' | 'tree_id',
): Promise<MigrationCounts> {
  const result = await sql<MigrationCounts>`
    SELECT
      (SELECT count(*)::text FROM ${sql.table(treeTable)}) AS trees,
      (SELECT count(*)::text FROM labels WHERE ${sql.ref(labelTreeColumn)} IS NOT NULL) AS "groupedLabels",
      (SELECT count(*)::text FROM labels WHERE ${sql.ref(labelTreeColumn)} IS NULL) AS "freeLabels",
      (SELECT count(*)::text FROM page_labels) AS "pageLabels",
      (SELECT count(*)::text FROM template_labels) AS "templateLabels"
  `.execute(db);

  return result.rows[0];
}

function assertCount(actual: string, expected: string, entity: string): void {
  if (Number(actual) !== Number(expected)) {
    throw new Error(
      `Label taxonomy migration count mismatch for ${entity}: expected ${expected}, got ${actual}`,
    );
  }
}
