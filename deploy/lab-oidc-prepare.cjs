// Executado por stdin no pod efêmero para preparar o cliente web e as duas contas do lab.
const fs = require('node:fs');
const https = require('node:https');
const host = 'as-docs-keycloak.as-docs-identity.svc.cluster.local';
const bootstrap = key => fs.readFileSync(`/run/keycloak-admin/${key}`, 'utf8');
function call(method, path, data, token) {
  const form = data instanceof URLSearchParams;
  const body = data ? (form ? data.toString() : JSON.stringify(data)) : '';
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body) Object.assign(headers, {'content-type': form ? 'application/x-www-form-urlencoded' : 'application/json', 'content-length': Buffer.byteLength(body)});
  return new Promise((resolve, reject) => {
    const ca = fs.readFileSync('/run/keycloak-tls/tls.crt');
    const req = https.request({hostname:host,port:8443,method,path:`/id${path}`,headers,ca,timeout:10000}, res => {
      let result = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { result += chunk; if (result.length > 262144) req.destroy(); });
      res.on('error', reject);
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) return reject(Error(`Keycloak HTTP ${res.statusCode}.`));
        try { resolve(result ? JSON.parse(result) : null); } catch { reject(Error('Keycloak retornou JSON inválido.')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(Error('Tempo de resposta do Keycloak excedido.')));
    req.end(body);
  });
}
const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/;

async function provision(call, bootstrap, origin, mode) {
  if (!/^http:\/\/as-docs-public-[0-9]+\.us-east-1\.elb\.amazonaws\.com$/.test(origin) || !['prepare', 'link'].includes(mode)) {
    throw Error('Origem ou operação incompatível com o laboratório descartável.');
  }
  const discovery = await call('GET', '/realms/as-docs/.well-known/openid-configuration');
  if (discovery?.issuer !== `${origin}/id/realms/as-docs`) throw Error('Issuer divergente no Keycloak privado.');
  const { access_token: token } = await call('POST', '/realms/master/protocol/openid-connect/token', new URLSearchParams({client_id:'admin-cli',grant_type:'password',username:bootstrap('username'),password:bootstrap('password')}));
  if (!token) throw Error('Autenticação administrativa privada indisponível.');
  const api = (method,path,body) => call(method,`/admin/realms/as-docs${path}`,body,token);
  const realm = await api('GET','');
  if (realm.realm !== 'as-docs' || realm.enabled !== true || realm.registrationAllowed !== false ||
      realm.resetPasswordAllowed !== false || realm.sslRequired?.toLowerCase() !== 'none') {
    throw Error('Realm divergente do laboratório descartável.');
  }
  const clients = await api('GET','/clients?clientId=docs-app-web');
  const [client] = clients;
  if (clients.length !== 1 || client.clientId !== 'docs-app-web' || client.protocol !== 'openid-connect' ||
      client.clientAuthenticatorType !== 'client-secret' || !client.enabled || client.publicClient !== false ||
      !client.standardFlowEnabled || client.bearerOnly || client.directAccessGrantsEnabled ||
      client.implicitFlowEnabled || client.serviceAccountsEnabled ||
      client.attributes?.['pkce.code.challenge.method'] !== 'S256' || client.redirectUris?.length !== 1 || client.redirectUris[0] !== `${origin}/api/auth/oidc/callback` ||
      !/^[\w-]{1,128}$/.test(client.id)) throw Error('Cliente web divergente da configuração esperada.');
  const {value: clientSecret} = await api('GET',`/clients/${client.id}/client-secret`);
  if (typeof clientSecret !== 'string' || clientSecret.length < 32 || /^\*+$/.test(clientSecret)) throw Error('Secret do cliente web indisponível.');
  const bindings = {};
  async function findAccount(n, allowMissing) {
    const username = `usuario-${n}`, email = `usuario${n}@tcc.local`;
    const [rows, names] = await Promise.all([
      api('GET', `/users?email=${encodeURIComponent(email)}&exact=true`),
      api('GET', `/users?username=${username}&exact=true`),
    ]);
    if (allowMissing && !rows.length && !names.length) return null;
    const user = rows[0];
    if (rows.length !== 1 || names.length !== 1 || user.id !== names[0].id ||
        user.username !== username || user.email !== email || user.enabled !== true ||
        user.emailVerified !== true || !user.firstName || !user.lastName || user.requiredActions?.length || !uuid.test(user.id)) {
      throw Error('Usuário de teste não corresponde ao login esperado.');
    }
    return user;
  }
  const accounts = await Promise.all([1, 2].map(n => findAccount(n, mode === 'prepare')));
  for (const n of [1, 2]) {
    let user = accounts[n - 1];
    if (!user) {
      const username = `usuario-${n}`, email = `usuario${n}@tcc.local`;
      await api('POST', '/users', { username, email, firstName: 'Usuário', lastName: String(n), emailVerified: true, enabled: true,
        credentials: [{ type: 'password', value: username, temporary: false }] });
      user = await findAccount(n, false);
    }
    bindings[user.email] = user.id;
  }
  if (new Set(Object.values(bindings)).size !== 2) throw Error('As duas contas devem ter sujeitos distintos.');
  return { clientSecret, bindings };
}

if (require.main === module || process.argv[1] === '-') {
  provision(call, bootstrap, process.argv[2], process.argv[3]).then(result => {
    // Canal privado do kubectl exec, capturado diretamente em memória pelo provisionador.
    process.stdout.write(JSON.stringify(result));
  }).catch(() => {
    // Nunca imprima corpo HTTP, configurações ou tokens.
    console.error('O bootstrap do cliente web no Keycloak falhou.');
    process.exitCode = 1;
  });
} else {
  module.exports = { provision };
}
