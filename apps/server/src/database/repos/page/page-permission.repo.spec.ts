import {
  CamelCasePlugin,
  CompiledQuery,
  DummyDriver,
  Kysely,
  PostgresAdapter,
  PostgresIntrospector,
  PostgresQueryCompiler,
} from 'kysely';
import {
  PagePermissionRepo,
  resolveEffectivePermission,
} from './page-permission.repo';
import { KyselyDB } from '../../types/kysely.types';

const userId = '00000000-0000-4000-8000-000000000001';

const rule = (overrides: Record<string, unknown> = {}) => ({
  pageAccessId: 'access-child',
  accessMode: 'shared',
  depth: 0,
  userId: null,
  teamId: null,
  workspaceWide: false,
  canView: false,
  canEdit: false,
  canDelete: false,
  teamMatches: false,
  ...overrides,
});

describe('resolveEffectivePermission', () => {
  it('prefers a shared child rule over a restricted ancestor', () => {
    const result = resolveEffectivePermission(
      [
        rule({ userId, canView: true, canEdit: true }),
        rule({
          pageAccessId: 'access-parent',
          accessMode: 'restricted',
          depth: 1,
        }),
      ],
      userId,
    );

    expect(result).toEqual({
      hasRestriction: false,
      blocked: false,
      permission: { canView: true, canEdit: true, canDelete: false },
    });
  });

  it('does not inherit permissions beyond a matching restricted page rule', () => {
    const result = resolveEffectivePermission(
      [
        rule({
          accessMode: 'restricted',
          userId,
          canView: true,
        }),
        rule({
          pageAccessId: 'access-parent',
          depth: 1,
          workspaceWide: true,
          canView: true,
          canEdit: true,
        }),
      ],
      userId,
    );

    expect(result).toEqual({
      hasRestriction: true,
      blocked: false,
      permission: { canView: true, canEdit: false, canDelete: false },
    });
  });
});

describe('PagePermissionRepo tree visibility', () => {
  it('treats only explicitly restricted access records as restricted ancestors', async () => {
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
    const repo = new PagePermissionRepo(db as unknown as KyselyDB);

    await repo.hasRestrictedAncestor(userId);

    expect(queries[0]?.sql).toContain('"page_access"."access_mode" = $2');
    expect(queries[0]?.parameters).toContain('restricted');
  });

  it('uses the common ACL condition when deciding whether a parent has visible children', async () => {
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
    const repo = new PagePermissionRepo(db as unknown as KyselyDB);

    await repo.getParentIdsWithAccessibleChildren(
      ['00000000-0000-4000-8000-000000000010'],
      userId,
    );

    const sql = queries[0]?.sql ?? '';
    expect(sql).toContain('workspace_wide');
    expect(sql).toContain('team_members');
    expect(sql).toContain('include_subpages');
  });

  it('filters public page candidates with one recursive ancestry query', async () => {
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
    const repo = new PagePermissionRepo(db as unknown as KyselyDB);

    await repo.filterPageIdsWithoutRestrictedAncestor([
      '00000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000012',
    ]);

    expect(queries).toHaveLength(1);
    expect(queries[0]?.sql).toContain('WITH RECURSIVE ancestors');
    expect(queries[0]?.sql).toContain("page_access.access_mode = 'restricted'");
    expect(queries[0]?.sql).toContain('unnest');
  });

  it('resolves edit permissions for user, Team, and Workspace rules in batch', async () => {
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
    const repo = new PagePermissionRepo(db as unknown as KyselyDB);

    await repo.filterAccessiblePageIdsWithPermissions(
      ['00000000-0000-4000-8000-000000000011'],
      userId,
    );

    const sql = queries[0]?.sql ?? '';
    expect(sql).toContain('can_edit');
    expect(sql).toContain('workspace_wide');
    expect(sql).toContain('permission_team_member');
  });
});
