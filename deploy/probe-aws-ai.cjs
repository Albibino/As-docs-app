// Executado no backend existente: usa a rede privada e a role do próprio app.
const { readFileSync } = require('node:fs');
const { randomUUID } = require('node:crypto');
const { request } = require('node:https');
const { rootCertificates } = require('node:tls');

const keycloak = 'https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443';
const ai = 'https://as-docs-ai.as-docs.svc.cluster.local:8443';
const scopes = {
  'docs-app-indexer': ['ai:index:read', 'ai:index:write'],
  'docs-app-assistant': ['ai:chat:invoke', 'ai:writing:invoke'],
};

function post(url, body, headers, ca) {
  return new Promise((resolve, reject) => {
    const req = request(url, { method: 'POST', headers: {
      ...headers, 'content-length': Buffer.byteLength(body),
    }, ca: [...rootCertificates, ca], timeout: 5000 }, (res) => {
      const parts = [];
      let size = 0;
      res.on('data', (part) => {
        size += part.length;
        if (size > 65536) req.destroy(new Error('response too large'));
        else parts.push(part);
      });
      res.on('error', reject);
      res.on('end', () => resolve([res.statusCode, Buffer.concat(parts).toString()]));
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.end(body);
  });
}

async function main() {
  const { keys, ca, aiCa, issuer } = JSON.parse(readFileSync(0, 'utf8'));
  const postgres = require(require.resolve('postgres', { paths: ['/app/apps/server'] }));
  const db = new URL(process.env.DATABASE_URL);
  db.searchParams.delete('schema');
  const sql = postgres(db.toString(), { max: 1, connect_timeout: 5, onnotice: () => {} });
  let rows;
  try {
    rows = await sql`select id from workspaces limit 2`;
  } finally {
    await sql.end({ timeout: 1 });
  }
  if (rows.length !== 1) throw new Error('expected exactly one workspace');
  const tenantId = rows[0].id;
  const bindings = {};
  const bearer = {};
  for (const [client, allowed] of Object.entries(scopes)) {
    for (const scope of allowed) {
      const form = new URLSearchParams({ grant_type: 'client_credentials', scope }).toString();
      const [status, response] = await post(`${keycloak}/id/realms/as-docs/protocol/openid-connect/token`, form, {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: `Basic ${Buffer.from(`${client}:${keys[client]}`).toString('base64')}`,
      }, ca);
      if (status !== 200) throw new Error('token request failed');
      const { access_token: token } = JSON.parse(response);
      // A resposta veio do endpoint fixo e autenticado por TLS; a IA valida a assinatura no smoke test.
      const claims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
      const aud = [claims.aud].flat();
      if (claims.iss !== issuer || claims.azp !== client || !aud.includes('docs-ai') ||
          !claims.scope.split(' ').includes(scope) || !/^[\w-]{1,128}$/.test(claims.sub) ||
          (bindings[client] && bindings[client].subject !== claims.sub)) {
        throw new Error('unexpected technical identity');
      }
      bindings[client] = { subject: claims.sub, tenantId };
      bearer[scope] = token;
    }
  }
  if (bindings['docs-app-indexer'].subject === bindings['docs-app-assistant'].subject) {
    throw new Error('technical identities must be distinct');
  }
  if (aiCa) {
    const body = JSON.stringify({ tenantId, pageIds: [randomUUID()] });
    for (const [scope, expected] of [['ai:index:read', 200], ['ai:chat:invoke', 403], [null, 401]]) {
      const headers = { 'content-type': 'application/json' };
      if (scope) headers.authorization = `Bearer ${bearer[scope]}`;
      const [status] = await post(`${ai}/v1/index/status`, body, headers, aiCa);
      if (status !== expected) throw new Error(`AI authorization check: expected ${expected}, got ${status}`);
    }
  }
  process.stdout.write(JSON.stringify(bindings));
}

main().catch(() => {
  // Não propagar erros que possam conter URL do banco, credenciais ou respostas do provedor.
  process.stderr.write('Sonda IA falhou: confira RDS, workspace, CA/issuer, grants técnicos e autorização da IA.\n');
  process.exitCode = 1;
});
