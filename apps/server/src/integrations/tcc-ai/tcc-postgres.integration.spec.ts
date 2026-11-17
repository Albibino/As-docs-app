/**
 * Integração com Postgres real (migrações aplicadas). Pula sem
 * `TCC_TEST_DATABASE_URL`. Ver docs/tcc/05-testes.md para subir o banco.
 *
 * Cobre o que só um banco real prova:
 * - o trigger de `content_version` (qualquer caminho de escrita incrementa);
 * - `ai_indexed_version` nunca regride;
 * - o seed cria exatamente 1 workspace, 1 time, 1 space e 2 usuários e é
 *   idempotente;
 * - as leituras do MCP veem a versão atual mesmo com o índice atrasado.
 */
import { Kysely, sql, CamelCasePlugin } from 'kysely';
import { PostgresJSDialect } from 'kysely-postgres-js';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const postgres = require('postgres');
import { TccSeedService } from '../../core/tcc/tcc-seed.service';
import { WorkspaceRepo } from '@tcc-docs/db/repos/workspace/workspace.repo';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { TeamRepo } from '@tcc-docs/db/repos/team/team.repo';
import { TeamMemberRepo } from '@tcc-docs/db/repos/team/team-member.repo';
import { SpaceRepo } from '@tcc-docs/db/repos/space/space.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { DocsReadService } from './docs-read.service';
import { AiIndexingService } from './ai-indexing.service';

const url = process.env.TCC_TEST_DATABASE_URL;
const describeDb = url ? describe : describe.skip;

// Roda em paralelo com tcc-cleanup-migrations (que aplica todas as migrações
// num banco descartável); o limite padrão de 5 s do Jest não basta sob carga.
jest.setTimeout(30_000);

describeDb('TCC versioned index — Postgres', () => {
  let db: Kysely<any>;
  let seed: TccSeedService;
  let docs: DocsReadService;
  let indexing: AiIndexingService;

  beforeAll(async () => {
    db = new Kysely<any>({
      dialect: new PostgresJSDialect({ postgres: postgres(url!, { max: 2 }) }),
      plugins: [new CamelCasePlugin()],
    });
    await sql`TRUNCATE workspaces CASCADE`.execute(db);

    const env: any = {};
    const workspaceRepo = new WorkspaceRepo(db as any);
    const userRepo = new UserRepo(db as any);
    const cache = new Map<string, unknown>();
    const cacheManager: any = {
      get: async (key: string) => cache.get(key),
      set: async (key: string, value: unknown) => void cache.set(key, value),
      del: async (key: string) => void cache.delete(key),
    };
    const spaceRepo = new SpaceRepo(db as any);
    const spaceMemberRepo = new SpaceMemberRepo(db as any, spaceRepo, cacheManager);
    const teamRepo = new TeamRepo(db as any);
    const teamMemberRepo = new TeamMemberRepo(db as any, teamRepo, userRepo);
    seed = new TccSeedService(
      db as any,
      workspaceRepo,
      userRepo,
      teamRepo,
      teamMemberRepo,
      spaceRepo,
    );
    docs = new DocsReadService(
      db as any,
      userRepo,
      new PagePermissionRepo(db as any),
      spaceMemberRepo,
    );
    indexing = new AiIndexingService(db as any, env);
  });

  afterAll(async () => {
    await db?.destroy();
  });

  it('seeds one workspace, one team, one space and the two fixed users, idempotently', async () => {
    const first = await seed.ensure();
    const second = await seed.ensure();

    expect(second.workspace.id).toBe(first.workspace.id);
    const count = async (table: string) =>
      Number(
        (
          await sql<{ n: string }>`SELECT count(*) AS n FROM ${sql.table(table)}`.execute(db)
        ).rows[0].n,
      );
    expect(await count('workspaces')).toBe(1);
    expect(await count('teams')).toBe(1);
    expect(await count('spaces')).toBe(1);
    expect(await count('users')).toBe(2);
    expect(await count('team_members')).toBe(2);
    expect(first.users.map((user) => user.name)).toEqual(['Usuário 1', 'Usuário 2']);
  });

  it('bumps content_version on every content change and never regresses the index marker', async () => {
    const { workspace, space, users } = await seed.ensure();
    const page = await db
      .insertInto('pages')
      .values({
        slugId: 'ferias01',
        title: 'Política de férias',
        content: (doc('Pedir com 30 dias de antecedência.')),
        textContent: 'Pedir com 30 dias de antecedência.',
        spaceId: space.id,
        workspaceId: workspace.id,
        creatorId: users[0].id,
      })
      .returning(['id', 'contentVersion', 'aiIndexedVersion'])
      .executeTakeFirstOrThrow();
    expect(page).toMatchObject({ contentVersion: 1, aiIndexedVersion: 0 });

    // A indexação confirma a v1.
    await indexing.markIndexed([{ pageId: page.id, version: 1, status: 'indexed' }]);

    // Usuário 2 edita: o trigger cria a v2. Nada é reenviado ainda.
    await db
      .updateTable('pages')
      .set({
        content: (doc('Pedir com 45 dias de antecedência.')),
        textContent: 'Pedir com 45 dias de antecedência.',
        lastUpdatedById: users[1].id,
      })
      .where('id', '=', page.id)
      .execute();
    // Alterar só metadados não cria versão.
    await db
      .updateTable('pages')
      .set({ updatedAt: new Date() })
      .where('id', '=', page.id)
      .execute();
    // Ninguém consegue escrever a versão por fora do trigger.
    await db
      .updateTable('pages')
      .set({ contentVersion: 99 })
      .where('id', '=', page.id)
      .execute();

    let row = await db
      .selectFrom('pages')
      .select(['contentVersion', 'aiIndexedVersion'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ contentVersion: 2, aiIndexedVersion: 1 });

    // Uma confirmação atrasada da v1 não faz o marcador regredir.
    await indexing.markIndexed([{ pageId: page.id, version: 2, status: 'indexed' }]);
    await indexing.markIndexed([{ pageId: page.id, version: 1, status: 'indexed' }]);
    row = await db
      .selectFrom('pages')
      .select(['contentVersion', 'aiIndexedVersion'])
      .where('id', '=', page.id)
      .executeTakeFirstOrThrow();
    expect(row).toEqual({ contentVersion: 2, aiIndexedVersion: 2 });
  });

  it('lists only pages whose current version is not yet indexed', async () => {
    const { workspace, space, users } = await seed.ensure();
    const fresh = await db
      .insertInto('pages')
      .values({
        slugId: 'pendente1',
        title: 'Reembolso',
        content: (doc('Reembolso em até 10 dias.')),
        textContent: 'Reembolso em até 10 dias.',
        spaceId: space.id,
        workspaceId: workspace.id,
        creatorId: users[0].id,
      })
      .returning('id')
      .executeTakeFirstOrThrow();

    const pending = await indexing.findPending(50, workspace.id);
    const ids = pending.map((page) => page.id);
    expect(ids).toContain(fresh.id);
    expect(pending.find((page) => page.id === fresh.id)?.contentVersion).toBe(1);
    // A página de férias já está com a v2 indexada.
    expect(pending.map((page) => page.title)).not.toContain('Política de férias');
  });

  it('MCP reads return the current version even when the index is behind', async () => {
    const { users } = await seed.ensure();
    const user = await docs.resolveUser(users[0].id, users[0].workspaceId);
    const page = await db
      .selectFrom('pages')
      .select('id')
      .where('title', '=', 'Política de férias')
      .executeTakeFirstOrThrow();

    // Usuário 1 faz a v3, ainda não indexada.
    await db
      .updateTable('pages')
      .set({
        content: (doc('Pedir com 60 dias de antecedência.')),
        textContent: 'Pedir com 60 dias de antecedência.',
      })
      .where('id', '=', page.id)
      .execute();

    const contexts = await docs.getPageContext(user!, [page.id]);
    expect(contexts).toHaveLength(1);
    const [context] = contexts;
    expect(context).toMatchObject({ version: 3, indexedVersion: 2, deleted: false });

    const read = await docs.readPage(user!, page.id);
    expect(read).toMatchObject({ version: 3 });
    expect(read!.markdown).toContain('60 dias');

    const found = await docs.searchPages(user!, 'antecedencia ferias');
    expect(found[0]).toMatchObject({ pageId: page.id, version: 3 });

    expect(await docs.readPage(user!, '00000000-0000-4000-8000-000000000000')).toBeNull();
  });
});

function doc(text: string) {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}
