const { strict: assert } = require('node:assert');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { execFileSync } = require('node:child_process');
const { test } = require('node:test');
const { provision } = require('./lab-oidc-prepare.cjs');
const { bind } = require('./lab-oidc-link.cjs');
const realmManifest = require('../config/keycloak/as-docs-realm.json');

const origin = 'http://as-docs-public-123456.us-east-1.elb.amazonaws.com';
const issuer = `${origin}/id/realms/as-docs`;
const uuid = n => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const bindings = { 'usuario1@tcc.local': uuid(1), 'usuario2@tcc.local': uuid(2) };

function keycloak() {
  const users = [];
  const realm = { ...realmManifest };
  const client = { ...realm.clients[0], id: uuid(10), redirectUris: [`${origin}/api/auth/oidc/callback`] };
  const fixture = {
    users, client, realm, discovered: issuer,
    run: mode => provision(call, () => 'fixture-admin', origin, mode),
  };
  async function call(method, path, body, token) {
    if (path.startsWith('/realms/as-docs/')) return { issuer: fixture.discovered };
    if (path.startsWith('/realms/master/')) return { access_token: 'fixture-token' };
    assert.equal(token, 'fixture-token');
    const url = new URL(path, 'https://fixture.invalid');
    const resource = url.pathname.replace(/^\/admin\/realms\/as-docs/, '');
    if (method === 'GET' && !resource) return realm;
    if (method === 'GET' && resource === '/clients') return [client];
    if (method === 'GET' && resource === `/clients/${client.id}/client-secret`) return { value: 'x'.repeat(32) };
    if (method === 'POST' && resource === '/users') {
      assert.deepEqual(body.credentials, [{ type: 'password', value: body.username, temporary: false }]);
      users.push({ ...body, id: bindings[body.email] });
      return null;
    }
    if (method === 'GET' && resource === '/users') {
      assert.equal(url.searchParams.get('exact'), 'true');
      return users.filter(u => ['email', 'username'].some(key => url.searchParams.get(key) === u[key]));
    }
    assert.fail('unexpected test request');
  }
  return fixture;
}

test('prepare provisions only the two fixture users; reruns retain their subjects', async () => {
  const fixture = keycloak();
  for (const mode of ['prepare', 'prepare', 'link']) {
    assert.deepEqual((await fixture.run(mode)).bindings, bindings);
    assert.equal(fixture.users.length, 2);
  }
});

test('link cannot recreate a missing Keycloak user', async () => {
  const fixture = keycloak();
  await fixture.run('prepare');
  fixture.users.pop();
  await assert.rejects(fixture.run('link'), /login esperado/);
  assert.equal(fixture.users.length, 1);
});

test('prepare rejects issuer, realm and web client drift without creating users', async () => {
  const fixture = keycloak();
  fixture.discovered += '/';
  await assert.rejects(fixture.run('prepare'), /Issuer divergente/);
  fixture.discovered = issuer;
  fixture.realm.registrationAllowed = true;
  await assert.rejects(fixture.run('prepare'), /Realm divergente/);
  fixture.realm.registrationAllowed = false;
  fixture.client.redirectUris.push('*');
  await assert.rejects(fixture.run('prepare'), /Cliente web divergente/);
  assert.equal(fixture.users.length, 0);
});

test('Postgres inserts both links, retains them on repeat, and rolls back conflicts',
  { skip: process.env.LAB_OIDC_TEST_POSTGRES !== '1' && 'set LAB_OIDC_TEST_POSTGRES=1 to run a disposable local Postgres' }, async () => {
    const postgres = require(require.resolve('postgres', { paths: [resolve(__dirname, '../apps/server')] }));
    const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
    const work = mkdtempSync(join(tmpdir(), 'oidc-pg-'));
    const dir = join(work, 'db');
    // Unix socket only, in a private directory, no live config or ambient credentials.
    const pg = (command, args) => execFileSync(join(bin, command), args, { stdio: 'pipe' });
    let started = false;
    let sql;
    try {
      pg('initdb', ['-D', dir, '-U', 'fixture', '-A', 'trust', '--no-locale']);
      pg('pg_ctl', ['-D', dir, '-l', join(work, 'pg.log'), '-o', `-c listen_addresses='' -k '${work}'`, '-w', 'start']);
      started = true;
      sql = postgres({ path: join(work, '.s.PGSQL.5432'), username: 'fixture', database: 'postgres', max: 1, connect_timeout: 3 });
      const input = { issuer, bindings };
      await assert.rejects(bind(sql, input), { code: '42P01' });
      // Projeção das migrações users e 20261122T120000-tcc-oidc-accounts.
      await sql`create table public.users (id uuid primary key, email text not null, workspace_id uuid,
                 deleted_at timestamptz, deactivated_at timestamptz, unique (email, workspace_id))`;
      await sql`create table public.oidc_accounts (issuer text not null, subject text not null,
                 user_id uuid not null references public.users(id) on delete cascade,
                 primary key (issuer, subject), unique (issuer, user_id))`;
      await sql`insert into public.users (id, email, workspace_id) values
                 (${uuid(3)}, 'usuario1@tcc.local', ${uuid(9)}), (${uuid(4)}, 'usuario2@tcc.local', ${uuid(9)}),
                 (${uuid(5)}, 'fixture@example.invalid', ${uuid(9)})`;
      await sql`insert into public.oidc_accounts values (${issuer}, ${uuid(1)}, ${uuid(5)})`;
      const rows = () => sql`select subject, user_id from public.oidc_accounts order by subject`.then(r => [...r]);
      await assert.rejects(bind(sql, input), /divergentes/);
      assert.deepEqual(await rows(), [{ subject: uuid(1), user_id: uuid(5) }]);
      await sql`delete from public.oidc_accounts`;
      await sql`update public.users set deactivated_at = now() where id = ${uuid(4)}`;
      await assert.rejects(bind(sql, input), /seed/);
      assert.deepEqual(await rows(), []);
      await sql`update public.users set deactivated_at = null where id = ${uuid(4)}`;
      await bind(sql, input);
      await bind(sql, input);
      assert.deepEqual(await rows(), [{ subject: uuid(1), user_id: uuid(3) }, { subject: uuid(2), user_id: uuid(4) }]);
    } finally {
      if (sql) await sql.end({ timeout: 1 });
      if (started) pg('pg_ctl', ['-D', dir, '-m', 'immediate', '-w', 'stop']);
      rmSync(work, { recursive: true, force: true });
    }
  });
