import { Kysely, PostgresDialect } from 'kysely';
import { up } from './migrations/20260825T140000-normalize-page-property-values';

function normalizeSql(value: string) {
  return value.replace(/\s+/g, ' ').trim().toLowerCase();
}

function createRecordingDatabase() {
  const queries: string[] = [];
  const client = {
    query: jest.fn(async (query: string) => {
      queries.push(normalizeSql(query));
      return { command: '', rowCount: 0, rows: [] };
    }),
    release: jest.fn(),
  };
  const pool = {
    connect: jest.fn(async () => client),
    end: jest.fn(async () => undefined),
  };
  const db = new Kysely<any>({
    dialect: new PostgresDialect({ pool: pool as never }),
  });

  return { db, queries };
}

describe('page property value normalization migration', () => {
  it('leaves scalar strings intact when their unquoted content is not valid JSON', async () => {
    const { db, queries } = createRecordingDatabase();

    await up(db);
    await db.destroy();

    const sql = queries.join(' ');
    expect(sql).toContain('pg_input_is_valid');
    expect(sql).toContain('else config');
    expect(sql).toContain('else value');
  });
});
