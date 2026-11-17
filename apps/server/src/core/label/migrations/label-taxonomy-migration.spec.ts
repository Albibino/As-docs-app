import { readFileSync } from 'node:fs';

describe('label taxonomy migration contract', () => {
  const source = readFileSync(
    require.resolve('../../../database/migrations/20260901T120000-label-taxonomy'),
    'utf8',
  );

  it('migrates the flat label model to trees, nodes and a closure table', () => {
    expect(source).toContain('ALTER TABLE label_groups RENAME TO label_trees');
    expect(source).toContain('RENAME COLUMN group_id TO tree_id');
    expect(source).toContain('CREATE TABLE label_node_closure');
    expect(source).toContain('INSERT INTO label_node_closure');
    expect(source).toContain("kind IN ('group', 'label')");
    expect(source).toContain('parent_id');
    expect(source).toContain('CREATE FUNCTION validate_label_parent()');
    expect(source).toContain('CREATE TRIGGER labels_validate_parent');
  });

  it('preserves legacy assignments while allowing tree-only endpoints', () => {
    expect(source).toContain('ALTER COLUMN label_id DROP NOT NULL');
    expect(source).toContain('label_tree_id');
    expect(source).toContain('page_labels_page_tree_unique');
    expect(source).toContain('template_labels_template_tree_unique');
    expect(source).toContain('label_id IS NULL');
  });

  it('validates assignment shape and derives the tree from selected nodes', () => {
    expect(source).toContain('sync_page_label_tree_id');
    expect(source).toContain('sync_template_label_tree_id');
    expect(source).toContain('label_tree_id IS DISTINCT FROM');
    expect(source).toContain('A taxonomy selection requires a tree');
  });

  it('removes required-template data and guards destructive rollback', () => {
    expect(source).toContain('DROP TABLE template_required_groups');
    expect(source).toContain('DROP COLUMN required_label_group_ids');
    expect(source).toContain('Refusing to flatten hierarchical label data');
    expect(source).toContain('depth > 0');
    expect(source).toContain('HAVING count(*) > 1');
  });

  it('counts grouped rows through the renamed tree_id column after migration', () => {
    expect(source).toContain(
      "getMigrationCounts(db, 'label_trees', 'tree_id')",
    );
    expect(source).toContain('sql.ref(labelTreeColumn)');
    expect(source).not.toContain(
      "getMigrationCounts(db, 'label_trees', 'group_id')",
    );
  });

  it('reuses workspace and space indexes created by the legacy migration', () => {
    expect(source).not.toContain(
      'CREATE INDEX labels_workspace_id_idx ON labels (workspace_id)',
    );
    expect(source).not.toContain(
      'CREATE INDEX labels_space_id_idx ON labels (space_id)',
    );
  });

  it('uses distinct names for the closure depth constraints', () => {
    expect(source).toContain(
      'CONSTRAINT label_node_closure_depth_non_negative_check',
    );
    expect(source).not.toContain('depth integer NOT NULL CHECK (depth >= 0)');
  });
});
