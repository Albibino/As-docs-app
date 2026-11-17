import { readdirSync } from 'node:fs';
import { join } from 'node:path';

describe('database migration order', () => {
  it('keeps label taxonomy migrations after the development database head', () => {
    const migrationDirectory = join(
      __dirname,
      '../../../database/migrations',
    );
    const currentDatabaseHead =
      '20260831T200000-secure-workspace-invitations';
    const labelMigrations = readdirSync(migrationDirectory)
      .filter((name) =>
        /(?:label-taxonomy|fix-label-node-closures-table-name)\.ts$/.test(
          name,
        ),
      )
      .sort();

    expect(labelMigrations).toHaveLength(2);
    expect(labelMigrations.every((name) => name > `${currentDatabaseHead}.ts`)).toBe(
      true,
    );
  });
});
