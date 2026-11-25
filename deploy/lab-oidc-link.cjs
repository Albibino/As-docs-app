// Enviado por stdin ao backend já pronto; labOidc é injetado pelo provisionador.
const emails = ['usuario1@tcc.local', 'usuario2@tcc.local'];

async function bind(sql, { issuer, bindings }) {
  await sql.begin(async tx => {
    await tx`set local statement_timeout = '15s'`;
    // Serializa a conferência e a inserção; não sobrescreve nenhum vínculo existente.
    await tx`lock table public.oidc_accounts in share row exclusive mode`;
    const users = await tx`
      select id, email, workspace_id from public.users
      where email in (${emails[0]}, ${emails[1]})
        and deleted_at is null and deactivated_at is null
      for share`;
    if (users.length !== 2 || !emails.every(email => users.some(u => u.email === email)) ||
        !users[0].workspace_id || users[0].workspace_id !== users[1].workspace_id) {
      throw Error('Usuários ativos do seed não identificados no mesmo workspace.');
    }
    const expected = users.map(u => ({ issuer, subject: bindings[u.email], user_id: u.id }));
    await tx`insert into public.oidc_accounts ${tx(expected, 'issuer', 'subject', 'user_id')}
             on conflict do nothing`;
    const actual = await tx`select subject, user_id from public.oidc_accounts where issuer = ${issuer}`;
    if (actual.length !== 2 || expected.some(e => !actual.some(a => a.subject === e.subject && a.user_id === e.user_id))) {
      throw Error('Vínculos anteriores divergentes.');
    }
  });
}

async function main() {
  const { issuer } = labOidc;
  if (process.env.OIDC_ENABLED !== 'true' || process.env.OIDC_ISSUER !== issuer) {
    throw Error('Issuer ativo no backend divergente.');
  }
  const db = new URL(process.env.DATABASE_URL);
  if (db.protocol !== 'postgresql:' || db.username !== 'asdocs_app' || db.pathname !== '/asdocs' ||
      !/^as-docs-postgres\.[a-z0-9.-]+\.us-east-1\.rds\.amazonaws\.com$/.test(db.hostname) ||
      db.searchParams.get('sslmode') !== 'verify-full' || !process.env.NODE_EXTRA_CA_CERTS) {
    throw Error('Banco dedicado do app com TLS não configurado.');
  }
  const postgres = require(require.resolve('postgres', { paths: ['/app/apps/server'] }));
  // Opções explícitas: não permita que parâmetros da URL afrouxem o TLS.
  db.search = '';
  const sql = postgres(db.toString(), {
    ssl: { rejectUnauthorized: true, servername: db.hostname }, max: 1, connect_timeout: 8, onnotice: () => {},
  });
  try {
    await bind(sql, labOidc);
  } finally {
    await sql.end({ timeout: 1 });
  }
}

if (typeof labOidc === 'undefined') {
  module.exports = { bind };
} else {
  main().catch(() => {
    // Não exponha URL, credenciais, parâmetros SQL ou detalhes internos do banco.
    console.error('Não foi possível concluir a transação de vínculos OIDC.');
    process.exitCode = 1;
  });
}
