import { ConfigService } from '@nestjs/config';
import { EnvironmentService } from '../environment/environment.service';
import { OidcProviderService } from '../oidc/oidc-provider.service';
import { AiHttpClient } from './ai-http-client.service';

const body = '{"tenantId":"workspace"}';

function setup(mode = 'true', url = 'https://ai.test') {
  const env = new EnvironmentService(
    new ConfigService({
      DOCS_AI_OAUTH_ENABLED: mode,
      DOCS_AI_URL: url,
      OIDC_ISSUER: 'http://localhost:9090/realms/as-docs',
      DOCS_AI_HMAC_SECRET: 'legacy-test-secret',
      OIDC_CLIENT_SECRET_INDEXER: 'indexer-test-secret',
      OIDC_CLIENT_SECRET_ASSISTANT: 'assistant-test-secret',
    }),
  );
  const provider = new OidcProviderService(env);
  const grant = jest
    .spyOn(provider, 'clientCredentials')
    .mockImplementation(async () => ({
      access_token: 'token-for-ai',
      token_type: 'bearer',
      expires_in: 300,
    }));
  const hmacSecret = jest.spyOn(env, 'getDocsAiHmacSecret');
  const fetchAi = jest
    .spyOn(global, 'fetch')
    .mockImplementation(async () => new Response('ok'));
  return {
    client: new AiHttpClient(env, provider),
    fetchAi,
    grant,
    hmacSecret,
  };
}

function headers(init: RequestInit) {
  return new Headers(init.headers);
}

afterEach(() => jest.restoreAllMocks());

describe('AiHttpClient', () => {
  it('rejects a remote HTTP destination before requesting a token', async () => {
    const { client, grant, fetchAi } = setup('true', 'http://remote.invalid');
    await expect(client.post('index', body)).rejects.toThrow(
      'Invalid AI service URL',
    );
    expect(grant).not.toHaveBeenCalled();
    expect(fetchAi).not.toHaveBeenCalled();
  });

  it('allows the internal Compose AI origin with a local issuer', async () => {
    const { client, fetchAi } = setup('true', 'http://ai:8000');
    await client.post('index', body);
    expect(String(fetchAi.mock.calls[0][0])).toBe(
      'http://ai:8000/v1/index/pages',
    );
  });
  it.each([
    [
      'index',
      '/v1/index/pages',
      'docs-app-indexer',
      'indexer-test-secret',
      'ai:index:write',
    ],
    [
      'chat',
      '/v1/chat/stream',
      'docs-app-assistant',
      'assistant-test-secret',
      'ai:chat:invoke',
    ],
    [
      'writing',
      '/v1/generations/stream',
      'docs-app-assistant',
      'assistant-test-secret',
      'ai:writing:invoke',
    ],
  ] as const)(
    'requests only the scope for %s and sends only Bearer authentication',
    async (op, path, id, secret, scope) => {
      const { client, fetchAi, grant, hmacSecret } = setup();
      await client.post(op, body);
      expect(grant).toHaveBeenCalledWith(id, secret, scope);
      const [url, options] = fetchAi.mock.calls[0];
      expect(String(url)).toBe(`https://ai.test${path}`);
      expect(options).toMatchObject({
        method: 'POST',
        body,
        redirect: 'error',
        signal: expect.any(AbortSignal),
      });
      expect(headers(options).get('authorization')).toBe('Bearer token-for-ai');
      expect(headers(options).get('idempotency-key')).toBeTruthy();
      expect(headers(options).get('accept')).toBe(
        op === 'index' ? null : 'text/event-stream',
      );
      for (const name of [
        'x-ai-consumer',
        'x-ai-timestamp',
        'x-ai-signature',
      ]) {
        expect(headers(options).has(name)).toBe(false);
      }
      expect(hmacSecret).not.toHaveBeenCalled();
    },
  );

  it('shares concurrent grants and refreshes early without sharing scopes', async () => {
    const { client, grant } = setup();
    const now = jest.spyOn(performance, 'now').mockReturnValue(0);
    await Promise.all([
      client.post('chat', body),
      client.post('chat', body),
      client.post('writing', body),
    ]);
    expect(grant).toHaveBeenCalledTimes(2);
    now.mockReturnValue(269_000);
    await client.post('chat', body);
    expect(grant).toHaveBeenCalledTimes(2);
    now.mockReturnValue(271_000);
    await Promise.all([client.post('chat', body), client.post('chat', body)]);
    expect(grant).toHaveBeenCalledTimes(3);
  });

  it('retries one 401 using a new token and identical body and key', async () => {
    const { client, fetchAi, grant } = setup();
    fetchAi.mockResolvedValueOnce(new Response('expired', { status: 401 }));
    grant.mockResolvedValueOnce({
      access_token: 'old-token',
      token_type: 'bearer',
      expires_in: 300,
    });
    expect((await client.post('writing', body)).ok).toBe(true);
    expect(grant).toHaveBeenCalledTimes(2);
    expect(fetchAi).toHaveBeenCalledTimes(2);
    const [, first] = fetchAi.mock.calls[0];
    const [, second] = fetchAi.mock.calls[1];
    expect(second.body).toBe(first.body);
    expect(headers(second).get('idempotency-key')).toBe(
      headers(first).get('idempotency-key'),
    );
    expect(headers(first).get('authorization')).toBe('Bearer old-token');
    expect(headers(second).get('authorization')).toBe('Bearer token-for-ai');
  });

  it('ignores a late 401 from a token another request already refreshed', async () => {
    const { client, fetchAi, grant } = setup();
    grant.mockResolvedValueOnce({
      access_token: 'old-token',
      token_type: 'bearer',
      expires_in: 300,
    });
    let rejectOld: (response: Response) => void;
    const late = new Promise<Response>((resolve) => {
      rejectOld = resolve;
    });
    fetchAi.mockImplementationOnce(() => late);
    fetchAi.mockResolvedValueOnce(new Response(null, { status: 401 }));
    const first = client.post('chat', body);
    await client.post('chat', body);
    rejectOld(new Response(null, { status: 401 }));
    await first;
    expect(fetchAi).toHaveBeenCalledTimes(4);
    expect(grant).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, 2],
    [403, 1],
    [503, 1],
  ])('stops at HTTP %s after %s attempt(s)', async (status, count) => {
    const { client, fetchAi, grant, hmacSecret } = setup();
    fetchAi.mockImplementation(async () => new Response(null, { status }));
    expect((await client.post('chat', body)).status).toBe(status);
    expect(fetchAi).toHaveBeenCalledTimes(count);
    expect(grant).toHaveBeenCalledTimes(count);
    expect(hmacSecret).not.toHaveBeenCalled();
  });

  it('never sends an AI request with a failed grant and can recover on a later call', async () => {
    const { client, fetchAi, grant, hmacSecret } = setup();
    grant.mockRejectedValueOnce(
      new Error('provider response with sensitive data'),
    );
    await expect(client.post('index', body)).rejects.toThrow(
      /^AI OAuth token unavailable$/,
    );
    expect(fetchAi).not.toHaveBeenCalled();
    expect(hmacSecret).not.toHaveBeenCalled();
    expect((await client.post('index', body)).ok).toBe(true);
  });

  it('rejects a token without a usable lifetime', async () => {
    const { client, fetchAi, grant } = setup();
    grant.mockResolvedValueOnce({
      access_token: 'no-expiry-token',
      token_type: 'bearer',
    });
    await expect(client.post('index', body)).rejects.toThrow(
      'AI OAuth token unavailable',
    );
    expect(fetchAi).not.toHaveBeenCalled();
  });

  it('lets a disconnected caller stop waiting without cancelling a shared grant', async () => {
    const { client, grant, fetchAi } = setup();
    const disconnected = new AbortController();
    let complete: (
      value: Awaited<ReturnType<OidcProviderService['clientCredentials']>>,
    ) => void;
    grant.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const cancelled = client.post('chat', body, disconnected.signal);
    const staying = client.post('chat', body);
    disconnected.abort();
    await expect(cancelled).rejects.toThrow();
    expect(fetchAi).not.toHaveBeenCalled();
    complete({
      access_token: 'shared-token',
      token_type: 'bearer',
      expires_in: 300,
    });
    expect((await staying).ok).toBe(true);
    expect(grant).toHaveBeenCalledTimes(1);
    expect(fetchAi).toHaveBeenCalledTimes(1);
  });

  it('does not retry an OAuth connection error', async () => {
    const { client, fetchAi } = setup();
    fetchAi.mockRejectedValueOnce(new Error('sensitive network error'));
    await expect(client.post('writing', body)).rejects.toThrow(
      /^AI service unavailable$/,
    );
    expect(fetchAi).toHaveBeenCalledTimes(1);
  });

  it('bounds an indexing request even without a caller signal', async () => {
    const { client, fetchAi } = setup();
    const deadline = new AbortController();
    const timeout = jest
      .spyOn(AbortSignal, 'timeout')
      .mockReturnValue(deadline.signal);
    fetchAi.mockImplementationOnce(
      async (_url, options) =>
        new Promise((_resolve, reject) => {
          options.signal.addEventListener(
            'abort',
            () => reject(options.signal.reason),
            { once: true },
          );
          deadline.abort();
        }),
    );
    await expect(client.post('index', body)).rejects.toThrow(
      'AI service unavailable',
    );
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(fetchAi).toHaveBeenCalledTimes(1);
  });

  it('does not retry a stream that breaks after headers and a chunk', async () => {
    const { client, fetchAi } = setup();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue('first chunk');
      },
      pull(controller) {
        controller.error(new Error('disconnected'));
      },
    });
    fetchAi.mockResolvedValueOnce(new Response(stream));
    const result = await client.post('writing', body);
    const reader = result.body.getReader();
    await expect(reader.read()).resolves.toMatchObject({
      value: 'first chunk',
    });
    await expect(reader.read()).rejects.toThrow('disconnected');
    expect(fetchAi).toHaveBeenCalledTimes(1);
  });

  it('uses HMAC exclusively in explicit legacy mode, including on 401', async () => {
    const { client, fetchAi, grant } = setup('false');
    fetchAi.mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect((await client.post('chat', body)).status).toBe(401);
    expect(grant).not.toHaveBeenCalled();
    expect(fetchAi).toHaveBeenCalledTimes(1);
    const sent = headers(fetchAi.mock.calls[0][1]);
    expect(sent.get('x-ai-signature')).toMatch(/^v1=[a-f0-9]{64}$/);
    expect(sent.has('authorization')).toBe(false);
  });
});
