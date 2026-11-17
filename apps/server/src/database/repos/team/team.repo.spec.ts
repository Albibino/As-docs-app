import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import { TeamRepo } from './team.repo';
import { KyselyDB } from '../../types/kysely.types';

describe('TeamRepo', () => {
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

    return { repo: new TeamRepo(db as unknown as KyselyDB), queries };
  }

  it('does not bind a blank user ID when an administrator lists teams', async () => {
    const { repo, queries } = createRepo();

    await repo.getTeamsPaginated(
      '00000000-0000-4000-8000-000000000001',
      { limit: 25, query: '', adminView: false },
    );

    expect(queries).toHaveLength(1);
    expect(queries[0]?.parameters).not.toContain('');
  });
});
