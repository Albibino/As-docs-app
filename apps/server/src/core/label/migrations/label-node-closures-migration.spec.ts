import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('label node closures migration contract', () => {
  const migrationPath = join(
    __dirname,
    '../../../database/migrations/20260901T120001-fix-label-node-closures-table-name.ts',
  );

  it('ships a corrective migration for the canonical plural table name', () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) return;

    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toContain('label_node_closure');
    expect(source).toContain('label_node_closures');
    expect(source).toContain(
      'ALTER TABLE label_node_closure RENAME TO label_node_closures',
    );
    expect(source).toContain("to_regclass('public.label_node_closure')");
    expect(source).toContain("to_regclass('public.label_node_closures')");
  });

  it('guards ambiguous and incomplete database states', () => {
    expect(existsSync(migrationPath)).toBe(true);

    if (!existsSync(migrationPath)) return;

    const source = readFileSync(migrationPath, 'utf8');
    expect(source).toContain('Both label closure tables exist');
    expect(source).toContain('No label closure table exists');
    expect(source).toContain('tree_id');
    expect(source).toContain('ancestor_id');
    expect(source).toContain('descendant_id');
    expect(source).toContain('depth');
  });
});
