import { ConfigService } from '@nestjs/config';
import { once } from 'node:events';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { EnvironmentService } from '../environment/environment.service';
import { OidcProviderService } from './oidc-provider.service';

// Jest's CJS loader cannot load ESM. Use Node 22's native loader for this real-library test.
jest.mock('openid-client', () =>
  process.getBuiltinModule('node:module').createRequire(__filename)(
    'openid-client',
  ),
);

const issuer = 'http://localhost:9090/realms/as-docs';
const tokenPath = '/realms/as-docs/protocol/openid-connect/token';
const discoveryPath = '/realms/as-docs/.well-known/openid-configuration';

function setup({ redirect = false, foreignEndpoint = false } = {}) {
  const received = jest.fn();
  const server = createServer(async (request, response) => {
    if (request.url === discoveryPath) {
      response.setHeader('content-type', 'application/json');
      response.end(
        JSON.stringify({
          issuer,
          authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
          token_endpoint: `${foreignEndpoint ? 'http://different.invalid' : 'http://localhost:9090'}${tokenPath}`,
          jwks_uri: `${issuer}/protocol/openid-connect/certs`,
        }),
      );
      return;
    }
    let body = '';
    for await (const chunk of request) body += chunk;
    received(request.url, request.headers.authorization, body);
    if (redirect && request.url === tokenPath) {
      response.writeHead(307, { location: '/not-the-token-endpoint' }).end();
      return;
    }
    response.setHeader('content-type', 'application/json');
    response.end(
      JSON.stringify({
        access_token: 'fixture-token',
        token_type: 'Bearer',
        expires_in: 300,
      }),
    );
  });
  return { server, received };
}

async function providerFor(server: Server) {
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const { port } = server.address() as AddressInfo;
  return new OidcProviderService(
    new EnvironmentService(
      new ConfigService({
        OIDC_ISSUER: issuer,
        OIDC_BACKCHANNEL_URL: `http://127.0.0.1:${port}`,
      }),
    ),
  );
}

async function close(server: Server) {
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

it('uses the shared issuer, backchannel and ClientSecretBasic for a single scope', async () => {
  const { server, received } = setup();
  try {
    const provider = await providerFor(server);
    const result = await provider.clientCredentials(
      'docs-app-indexer',
      'indexer-fixture',
      'ai:index:write',
    );
    expect(result).toMatchObject({
      access_token: 'fixture-token',
      token_type: 'bearer',
      expires_in: 300,
    });
    expect(received).toHaveBeenCalledTimes(1);
    const [path, authorization, body] = received.mock.calls[0];
    expect(path).toBe(tokenPath);
    const [scheme, encoded] = authorization.split(' ');
    expect(scheme).toBe('Basic');
    expect(
      Buffer.from(encoded, 'base64')
        .toString('utf8')
        .split(':')
        .map(decodeURIComponent),
    ).toEqual(['docs-app-indexer', 'indexer-fixture']);
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      scope: 'ai:index:write',
      grant_type: 'client_credentials',
    });
    // The BFF still builds browser-facing URLs, not transport URLs.
    const oidc = await import('openid-client');
    const web = await provider.configuration('docs-app-web', 'web-fixture');
    expect(web.clientMetadata().id_token_signed_response_alg).toBe('RS256');
    expect(
      oidc.buildAuthorizationUrl(web, { response_type: 'code' }).origin,
    ).toBe(new URL(issuer).origin);
  } finally {
    await close(server);
  }
});

it('rejects a remote HTTP backchannel even for a localhost issuer', async () => {
  const fetchSpy = jest
    .spyOn(global, 'fetch')
    .mockRejectedValue(new Error('network'));
  try {
    const provider = new OidcProviderService(
      new EnvironmentService(
        new ConfigService({
          OIDC_ISSUER: issuer,
          OIDC_BACKCHANNEL_URL: 'http://remote.invalid',
        }),
      ),
    );
    await expect(
      provider.clientCredentials('indexer', 'fixture', 'ai:index:write'),
    ).rejects.toThrow('OIDC requires HTTPS');
    expect(fetchSpy).not.toHaveBeenCalled();
  } finally {
    fetchSpy.mockRestore();
  }
});

it('allows an opted-in AWS HTTP web issuer only via the private HTTPS backchannel', async () => {
  const origin = 'http://as-docs-public-123456.us-east-1.elb.amazonaws.com';
  const labIssuer = `${origin}/id/realms/as-docs`;
  const backchannel = 'https://as-docs-keycloak.as-docs-identity.svc.cluster.local:8443';
  const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () =>
    Response.json({ issuer: labIssuer, authorization_endpoint: `${labIssuer}/auth`, token_endpoint: `${labIssuer}/token` }),
  );
  const provider = (flag: string, transport: string, oauth = 'false') => new OidcProviderService(
    new EnvironmentService(new ConfigService({
      OIDC_ISSUER: labIssuer,
      OIDC_BACKCHANNEL_URL: transport,
      OIDC_AWS_LAB_HTTP: flag,
      DOCS_AI_OAUTH_ENABLED: oauth,
    })),
  );
  try {
    await expect(provider('false', backchannel).configuration('web', 'fixture')).rejects.toThrow('OIDC requires HTTPS');
    await expect(provider('true', origin).configuration('web', 'fixture')).rejects.toThrow('OIDC requires HTTPS');
    await expect(provider('true', backchannel).clientCredentials('tech', 'fixture', 'scope')).rejects.toThrow('OIDC requires HTTPS');
    expect(fetchSpy).not.toHaveBeenCalled();
    const configuration = await provider('true', backchannel).configuration('web', 'fixture');
    const oidc = await import('openid-client');
    expect(oidc.buildAuthorizationUrl(configuration, { response_type: 'code' }).origin).toBe(origin);
    expect(String(fetchSpy.mock.calls[0][0])).toBe(`${backchannel}/id/realms/as-docs/.well-known/openid-configuration`);
    fetchSpy.mockClear().mockResolvedValueOnce(Response.json({
      issuer: labIssuer, token_endpoint: `${labIssuer}/token`,
    })).mockResolvedValueOnce(Response.json({ access_token: 'fixture', token_type: 'Bearer' }));
    await expect(provider('true', backchannel, 'true').clientCredentials('tech', 'fixture', 'scope'))
      .resolves.toMatchObject({ access_token: 'fixture' });
    expect(fetchSpy.mock.calls.map(([url]) => String(url))).toEqual([
      `${backchannel}/id/realms/as-docs/.well-known/openid-configuration`,
      `${backchannel}/id/realms/as-docs/token`,
    ]);
  } finally {
    fetchSpy.mockRestore();
  }
});

it('does not resend Basic credentials to a redirected token endpoint', async () => {
  const { server, received } = setup({ redirect: true });
  try {
    const provider = await providerFor(server);
    await expect(
      provider.clientCredentials(
        'docs-app-indexer',
        'indexer-fixture',
        'ai:index:write',
      ),
    ).rejects.toThrow();
    expect(received).toHaveBeenCalledTimes(1);
    expect(received.mock.calls[0][0]).toBe(tokenPath);
  } finally {
    await close(server);
  }
});

it('does not send credentials to an off-origin endpoint in discovery', async () => {
  const { server, received } = setup({ foreignEndpoint: true });
  try {
    const provider = await providerFor(server);
    await expect(
      provider.clientCredentials(
        'docs-app-indexer',
        'indexer-fixture',
        'ai:index:write',
      ),
    ).rejects.toThrow();
    expect(received).not.toHaveBeenCalled();
  } finally {
    await close(server);
  }
});
