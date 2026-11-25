const assert = require('node:assert/strict');
const { test } = require('node:test');
const { loadCredentials } = require('./keycloak-ai-clients.cjs');

function fixture(override = {}) {
  const cases = {
    'docs-app-indexer': ['ai:index:read', 'ai:index:write'],
    'docs-app-assistant': ['ai:chat:invoke', 'ai:writing:invoke'],
  };
  return async (method, path) => {
    assert.equal(method, 'GET');
    const id = path.split(/(?:clientId=|\/)/).find((piece) => Object.hasOwn(cases, piece));
    assert.ok(id);
    if (path.includes('clientId=')) return [{
      id, clientId: id, enabled: true, serviceAccountsEnabled: true,
      publicClient: false, standardFlowEnabled: false, directAccessGrantsEnabled: false, implicitFlowEnabled: false,
      fullScopeAllowed: false, clientAuthenticatorType: 'client-secret',
      optionalClientScopes: cases[id], defaultClientScopes: ['docs-ai-audience', 'basic'], ...override,
    }];
    if (path.endsWith('/default-client-scopes')) return ['docs-ai-audience', 'basic'].map(name => ({ name }));
    if (path.endsWith('/optional-client-scopes')) return (override.optionalClientScopes ?? cases[id]).map(name => ({ name }));
    assert.ok(path.endsWith('/client-secret'));
    return { value: `fixture-secret-for-${id}` };
  };
}

test('obtém os dois segredos existentes sem rotacionar', async () => {
  assert.deepEqual(await loadCredentials(fixture()), {
    OIDC_CLIENT_SECRET_INDEXER: 'fixture-secret-for-docs-app-indexer',
    OIDC_CLIENT_SECRET_ASSISTANT: 'fixture-secret-for-docs-app-assistant',
  });
});

test('rejeita configuração divergente em vez de adotar cliente inseguro', async () => {
  await assert.rejects(loadCredentials(fixture({ standardFlowEnabled: true })), /cliente técnico/);
  await assert.rejects(loadCredentials(fixture({ optionalClientScopes: ['ai:index:read', 'ai:chat:invoke'] })), /Escopos inesperados/);
});
