import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { EnvironmentService } from '../environment/environment.service';
import { OidcProviderService } from '../oidc/oidc-provider.service';
import { signAiRequest } from './ai-signing';

const OPERATIONS = {
  index: {
    path: '/v1/index/pages',
    client: 'indexer',
    scope: 'ai:index:write',
    stream: false,
  },
  chat: {
    path: '/v1/chat/stream',
    client: 'assistant',
    scope: 'ai:chat:invoke',
    stream: true,
  },
  writing: {
    path: '/v1/generations/stream',
    client: 'assistant',
    scope: 'ai:writing:invoke',
    stream: true,
  },
} as const;

type Operation = keyof typeof OPERATIONS;
type OperationConfig = (typeof OPERATIONS)[Operation];
type AccessToken = { value: string; refreshAt: number };

// A caller may stop waiting without cancelling the grant shared with other calls.
function waitForToken(
  pending: Promise<AccessToken>,
  signal: AbortSignal,
): Promise<AccessToken> {
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    if (signal.aborted) abort();
    void pending
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
}

@Injectable()
export class AiHttpClient {
  private readonly tokens = new Map<string, AccessToken>();
  private readonly grants = new Map<string, Promise<AccessToken>>();

  constructor(
    private readonly env: EnvironmentService,
    private readonly provider: OidcProviderService,
  ) {}

  async post(
    operation: Operation,
    body: string,
    callerSignal?: AbortSignal,
  ): Promise<Response> {
    const config = OPERATIONS[operation];
    const timeout = AbortSignal.timeout(config.stream ? 120_000 : 30_000);
    const signal = callerSignal
      ? AbortSignal.any([callerSignal, timeout])
      : timeout;
    signal.throwIfAborted();
    const url = this.requestUrl(config.path);
    const idempotencyKey = randomUUID();
    const send = (headers: Record<string, string>) =>
      fetch(url, {
        method: 'POST',
        redirect: 'error',
        headers: config.stream
          ? { ...headers, accept: 'text/event-stream' }
          : headers,
        body,
        signal,
      });

    if (!this.env.isDocsAiOAuthEnabled()) {
      const headers = signAiRequest({
        secret: this.env.getDocsAiHmacSecret(),
        path: config.path,
        body,
        idempotencyKey,
      });
      // Legacy writing retried transport failures before any response, with the same request.
      return this.sendLegacy(
        () => send(headers),
        operation === 'writing',
        signal,
      );
    }

    const id = `docs-app-${config.client}`;
    const key = `${id}:${config.scope}`;
    const sendWithToken = async (token: AccessToken) => {
      signal.throwIfAborted();
      try {
        return await send({
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
          authorization: `Bearer ${token.value}`,
        });
      } catch {
        throw new Error('AI service unavailable');
      }
    };

    const token = await waitForToken(this.token(key, id, config), signal);
    const response = await sendWithToken(token);
    if (response.status !== 401) return response;
    this.invalidate(key, token);
    await response.body?.cancel().catch(() => undefined);

    signal.throwIfAborted();
    const fresh = await waitForToken(this.token(key, id, config), signal);
    const retry = await sendWithToken(fresh);
    if (retry.status === 401) this.invalidate(key, fresh);
    return retry;
  }

  private requestUrl(path: string): URL {
    try {
      const url = new URL(path, this.env.getDocsAiUrl());
      if (
        !['https:', 'http:'].includes(url.protocol) ||
        url.username ||
        url.password
      ) {
        throw new Error();
      }
      if (url.protocol === 'http:' && this.env.isDocsAiOAuthEnabled()) {
        const issuer = new URL(this.env.getOidcIssuer());
        if (
          url.origin !== 'http://ai:8000' ||
          issuer.protocol !== 'http:' ||
          issuer.hostname !== 'localhost'
        ) {
          throw new Error();
        }
      }
      return url;
    } catch {
      throw new Error('Invalid AI service URL');
    }
  }

  private async sendLegacy(
    send: () => Promise<Response>,
    retry: boolean,
    signal: AbortSignal,
  ): Promise<Response> {
    try {
      return await send();
    } catch {
      if (retry && !signal.aborted) {
        try {
          return await send();
        } catch {
          // Do not expose request details from the transport error.
        }
      }
      throw new Error('AI service unavailable');
    }
  }

  private token(
    key: string,
    id: string,
    config: OperationConfig,
  ): Promise<AccessToken> {
    const cached = this.tokens.get(key);
    if (cached && performance.now() < cached.refreshAt)
      return Promise.resolve(cached);
    if (cached) this.tokens.delete(key);

    const pending = this.grants.get(key);
    if (pending) return pending;

    const refresh = this.requestToken(id, config)
      .then((token) => {
        this.tokens.set(key, token);
        return token;
      })
      .finally(() => this.grants.delete(key));
    this.grants.set(key, refresh);
    return refresh;
  }

  private async requestToken(
    id: string,
    config: OperationConfig,
  ): Promise<AccessToken> {
    const startedAt = performance.now();
    try {
      const result = await this.provider.clientCredentials(
        id,
        this.env.getDocsAiOAuthSecret(config.client),
        config.scope,
      );
      const ttl = result.expires_in * 1000;
      if (
        !/^[a-zA-Z0-9._~+/=-]+$/.test(result.access_token ?? '') ||
        result.token_type?.toLowerCase() !== 'bearer' ||
        !Number.isFinite(ttl) ||
        startedAt + ttl <= performance.now()
      ) {
        throw new Error();
      }
      return {
        value: result.access_token,
        refreshAt: startedAt + ttl - Math.min(30_000, ttl / 10),
      };
    } catch {
      throw new Error('AI OAuth token unavailable');
    }
  }

  private invalidate(key: string, rejected: AccessToken) {
    // A late 401 must not evict the token another caller already refreshed.
    if (this.tokens.get(key) === rejected) this.tokens.delete(key);
  }
}
