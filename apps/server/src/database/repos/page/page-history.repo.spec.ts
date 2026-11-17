import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { KyselyDB } from '../../types/kysely.types';
import { PageHistoryRepo } from './page-history.repo';

describe('PageHistoryRepo matching snapshots', () => {
  function createRepo() {
    const queries: CompiledQuery[] = [];
    const db = new Kysely<any>({
      dialect: {
        createAdapter: () => new PostgresAdapter(),
        createDriver: () => new DummyDriver(),
        createIntrospector: (kysely) => new PostgresIntrospector(kysely),
        createQueryCompiler: () => new PostgresQueryCompiler(),
      },
      plugins: [new CamelCasePlugin()],
      log: (event) => {
        queries.push(event.query);
      },
    });

    return { repo: new PageHistoryRepo(db as unknown as KyselyDB), queries };
  }

  it('uses JSONB equality and deterministic newest-first ordering', async () => {
    const { repo, queries } = createRepo();
    const content = {
      type: 'doc',
      content: [{ type: 'paragraph', attrs: { align: null } }],
    };

    await repo.findLatestMatchingSnapshot('page-1', 'Rascunho', content);

    expect(queries).toHaveLength(1);
    expect(queries[0].sql).toContain('"kind" = $2');
    expect(queries[0].sql).toContain('"content" = $4::text::jsonb');
    expect(queries[0].sql).toContain('order by "created_at" desc, "id" desc');
    expect(queries[0].parameters).toEqual([
      'page-1',
      'automatic',
      'Rascunho',
      JSON.stringify(content),
      1,
    ]);
  });
});
