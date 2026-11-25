// Roda no pod efêmero, com a credencial administrativa montada pelo Kubernetes.
const { readFileSync } = require('node:fs');
const { request } = require('node:https');

const clients = {
  'docs-app-indexer': ['OIDC_CLIENT_SECRET_INDEXER', ['ai:index:read', 'ai:index:write']],
  'docs-app-assistant': ['OIDC_CLIENT_SECRET_ASSISTANT', ['ai:chat:invoke', 'ai:writing:invoke']],
};

async function loadCredentials(admin) {
  const credentials = {};
  for (const [name, [env, scopes]] of Object.entries(clients)) {
    const found = await admin('GET', `/clients?clientId=${name}`);
    const [client] = found;
    if (found.length !== 1 || client.clientId !== name || !/^[\w-]{1,128}$/.test(client.id) ||
        client.enabled !== true || client.publicClient !== false || client.clientAuthenticatorType !== 'client-secret' ||
        client.serviceAccountsEnabled !== true || client.standardFlowEnabled !== false ||
        client.implicitFlowEnabled !== false || client.directAccessGrantsEnabled !== false || client.fullScopeAllowed !== false) {
      throw Error(`Configuração inesperada para o cliente técnico ${name}.`);
    }
    const check = (actual, expected) => actual?.length === expected.length && expected.every(v => actual.includes(v));
    const defaults = await admin('GET', `/clients/${client.id}/default-client-scopes`);
    const optional = await admin('GET', `/clients/${client.id}/optional-client-scopes`);
    if (!check(defaults.map(s => s.name), ['basic', 'docs-ai-audience']) || !check(optional.map(s => s.name), scopes)) {
      throw Error(`Escopos inesperados para o cliente técnico ${name}.`);
    }
    const { value } = await admin('GET', `/clients/${client.id}/client-secret`);
    if (typeof value !== 'string' || !value || /^[*]+$/.test(value)) throw Error(`Credencial indisponível para ${name}.`);
    credentials[env] = value;
  }
  return credentials;
}

async function main() {
  const ca = readFileSync('/run/keycloak-tls/tls.crt');
  function fetchJson(method, path, token, form) {
    const data = form?.toString();
    const headers = token ? { authorization: `Bearer ${token}` } : {
      'content-type': 'application/x-www-form-urlencoded',
      'content-length': Buffer.byteLength(data),
    };
    return new Promise((resolve, reject) => {
      const req = request({ hostname: 'as-docs-keycloak.as-docs-identity.svc.cluster.local', port: 8443,
        ca, method, path: `/id${path}`, headers, timeout: 10000 }, res => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', chunk => { body += chunk; if (body.length > 262144) req.destroy(); });
        res.on('error', reject);
        res.on('end', () => {
          if (res.statusCode !== 200) return reject(Error(`Keycloak privado: HTTP ${res.statusCode}.`));
          try { resolve(JSON.parse(body)); } catch { reject(Error('Resposta inválida do Keycloak privado.')); }
        });
      });
      req.on('error', reject);
      req.on('timeout', () => req.destroy(Error('Timeout no Keycloak privado.')));
      req.end(data);
    });
  }
  const form = new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli',
    username: readFileSync('/run/keycloak-admin/username', 'utf8'),
    password: readFileSync('/run/keycloak-admin/password', 'utf8') });
  const { access_token: token } = await fetchJson('POST', '/realms/master/protocol/openid-connect/token', null, form);
  if (!token) throw Error('Sessão administrativa privada indisponível.');
  const credentials = await loadCredentials((method, path) => fetchJson(method, `/admin/realms/as-docs${path}`, token));
  // O stdout do exec vai direto à criação do Secret, nunca ao terminal nem ao state.
  process.stdout.write(JSON.stringify({ apiVersion: 'v1', kind: 'Secret', type: 'Opaque',
    metadata: { name: 'as-docs-backend-ai-oauth', namespace: 'as-docs' },
    data: Object.fromEntries(Object.entries(credentials).map(([key, value]) => [key, Buffer.from(value).toString('base64')])) }));
}

module.exports = { loadCredentials };
if (!module.parent) main().catch(error => {
  const message = error.message;
  process.stderr.write((/^(Keycloak privado: HTTP \d{3}\.|Configuração inesperada para o cliente técnico [\w-]+\.|Escopos inesperados para o cliente técnico [\w-]+\.|Credencial indisponível para [\w-]+\.)$/.test(message)
    ? message : 'Não foi possível obter as credenciais técnicas via Keycloak privado.') + '\n');
  process.exitCode = 1;
});
