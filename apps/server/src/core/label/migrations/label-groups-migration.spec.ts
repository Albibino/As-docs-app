import { readFileSync } from 'node:fs';
import { toLabelSlug } from '../utils';

describe('label groups migration collision fixtures', () => {
  const source = readFileSync(
    require.resolve('../../../database/migrations/20260809T120000-label-groups'),
    'utf8',
  );

  it('uses the full UUID rather than a collision-prone fixed prefix', () => {
    const ids = [
      '12345678-0000-0000-0000-000000000001',
      '12345678-0000-0000-0000-000000000002',
    ];
    const generated = ids.map(
      (id) => `${toLabelSlug('Roadmap')}-${id.replaceAll('-', '')}`,
    );

    expect(new Set(generated).size).toBe(2);
    expect(source).toContain(
      "'__legacy__' || replace(label.id::text, '-', '')",
    );
    expect(source).not.toContain("left(replace(label.id::text, '-', ''), 8)");
  });

  it('enforces the denormalized group for inserts and every relevant update', () => {
    expect(source).toContain(
      'BEFORE INSERT OR UPDATE OF label_id, label_group_id ON page_labels',
    );
    expect(source).toContain('AFTER UPDATE OF group_id ON labels');
    expect(source).toContain('FOR UPDATE');
  });

  it('folds accented legacy names with runtime NFD semantics', () => {
    expect(toLabelSlug('Escopo Técnico')).toBe('escopo-tecnico');
    expect(source).toContain('normalize(name, NFD)');
    expect(source).toContain("U&'[\\\\0300-\\\\036f]'");
  });
});
