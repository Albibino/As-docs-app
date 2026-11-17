import {
  CamelCasePlugin,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
  CompiledQuery,
  sql,
} from 'kysely';
import { LabelRepo } from './label.repo';
import { KyselyDB } from '../../types/kysely.types';

describe('LabelRepo page queries', () => {
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
    const spaceMemberRepo = {
      getUserSpaceIdsQuery: () => sql`'space-1'`,
    };
    const pagePermissionRepo = {
      accessiblePageCondition: () => sql<boolean>`true`,
    };

    return {
      repo: new LabelRepo(
        db as unknown as KyselyDB,
        spaceMemberRepo as any,
        pagePermissionRepo as any,
      ),
      queries,
    };
  }

  const pagination = { limit: 25, query: '', adminView: false };

  it('filters a tree by every assignment in that tree, including tree-only assignments', async () => {
    const { repo, queries } = createRepo();

    await repo
      .findPagesByTreeId('tree-status', 'user-1', {
        pagination,
      })
      .catch(() => undefined);

    const query = queries.find((item) => item.sql.includes('from "pages"'));
    expect(query?.sql).toContain('"page_labels"."label_tree_id" = $1');
    expect(query?.sql).not.toContain('"page_labels"."label_id" = $1');
    expect(query?.parameters).toContain('tree-status');
  });

  it('filters a label by itself and its descendants through the closure table', async () => {
    const { repo, queries } = createRepo();

    await repo
      .findPagesByLabelId('node-erp', 'user-1', {
        pagination,
      })
      .catch(() => undefined);

    const query = queries.find((item) => item.sql.includes('from "pages"'));
    expect(query?.sql).toContain('"page_labels"."label_id" = $1');
    expect(query?.sql).toContain('"label_node_closures"');
    expect(query?.parameters).toContain('node-erp');
  });
});
