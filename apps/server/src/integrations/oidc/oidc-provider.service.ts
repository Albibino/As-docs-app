import { Injectable } from '@nestjs/common';
import type { Configuration, TokenEndpointResponse } from 'openid-client';
import { EnvironmentService } from '../environment/environment.service';

function providerUrl(value: string): URL {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new Error('Invalid OIDC provider URL');
  }
  return url;
}

@Injectable()
export class OidcProviderService {
  private readonly configurations = new Map<string, Promise<Configuration>>();

  constructor(private readonly env: EnvironmentService) {}

  configuration(id: string, secret: string): Promise<Configuration> {
    return this.cachedConfiguration('web', id, secret);
  }

  async clientCredentials(
    id: string,
    secret: string,
    scope: string,
  ): Promise<TokenEndpointResponse> {
    const config = await this.cachedConfiguration('service', id, secret);
    const oidc = await import('openid-client');
    return oidc.clientCredentialsGrant(config, { scope });
  }

  private cachedConfiguration(
    kind: 'web' | 'service',
    id: string,
    secret: string,
  ): Promise<Configuration> {
    const key = `${kind}:${id}`;
    const current = this.configurations.get(key);
    if (current) return current;
    const pending = this.discover(id, secret, kind === 'web').catch((error) => {
      this.configurations.delete(key);
      throw error;
    });
    this.configurations.set(key, pending);
    return pending;
  }

  private async discover(
    id: string,
    secret: string,
    web: boolean,
  ): Promise<Configuration> {
    const oidc = await import('openid-client');
    const issuer = providerUrl(this.env.getOidcIssuer());
    const backchannel = this.env.getOidcBackchannelUrl();
    const transport = backchannel ? providerUrl(backchannel) : issuer;
    if (backchannel && transport.pathname !== '/') {
      throw new Error('OIDC_BACKCHANNEL_URL must be an origin');
    }
    const localHttp =
      issuer.protocol === 'http:' && issuer.hostname === 'localhost';
    const localTransport =
      localHttp &&
      (transport.origin === 'http://keycloak:8080' ||
        ['localhost', '127.0.0.1', '[::1]'].includes(transport.hostname));
    if (
      (issuer.protocol !== 'https:' && !localHttp) ||
      (transport.protocol !== 'https:' && !localTransport)
    ) {
      throw new Error('OIDC requires HTTPS outside the local Compose lab');
    }
    return oidc.discovery(
      issuer,
      id,
      web ? { id_token_signed_response_alg: 'RS256' } : undefined,
      oidc.ClientSecretBasic(secret),
      {
        timeout: 5,
        execute: [
          ...(localHttp ? [oidc.allowInsecureRequests] : []),
          ...(web ? [oidc.enableNonRepudiationChecks] : []),
        ],
        [oidc.customFetch]: (url, options) => {
          const target = new URL(url);
          if (
            target.origin !== issuer.origin ||
            target.username ||
            target.password
          ) {
            throw new Error('Unexpected OIDC endpoint');
          }
          // Keep the public issuer in the protocol; only the connection uses Docker DNS.
          const address = new URL(transport.origin);
          address.pathname = target.pathname;
          address.search = target.search;
          if (
            options.body != null &&
            !(options.body instanceof URLSearchParams) &&
            typeof options.body !== 'string'
          ) {
            throw new Error('Unexpected OIDC request body');
          }
          return fetch(address, {
            ...options,
            redirect: 'error',
            body: options.body as URLSearchParams | string | undefined,
          });
        },
      },
    );
  }
}
