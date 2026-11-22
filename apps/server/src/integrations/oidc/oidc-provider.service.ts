import { Injectable } from '@nestjs/common';
import type { Configuration } from 'openid-client';
import { EnvironmentService } from '../environment/environment.service';

function providerUrl(value: string): URL {
  const url = new URL(value);
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username || url.password || url.search || url.hash
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
    const current = this.configurations.get(id);
    if (current) return current;
    const pending = this.discover(id, secret).catch((error) => {
      this.configurations.delete(id);
      throw error;
    });
    this.configurations.set(id, pending);
    return pending;
  }

  private async discover(id: string, secret: string): Promise<Configuration> {
    const oidc = await import('openid-client');
    const issuer = providerUrl(this.env.getOidcIssuer());
    const backchannel = this.env.getOidcBackchannelUrl();
    const transport = backchannel ? providerUrl(backchannel) : issuer;
    if (backchannel && transport.pathname !== '/') {
      throw new Error('OIDC_BACKCHANNEL_URL must be an origin');
    }
    const localHttp = issuer.protocol === 'http:' && issuer.hostname === 'localhost';
    if (!localHttp && (issuer.protocol !== 'https:' || transport.protocol !== 'https:')) {
      throw new Error('OIDC requires HTTPS outside the local Compose lab');
    }
    return oidc.discovery(issuer, id, { id_token_signed_response_alg: 'RS256' },
      oidc.ClientSecretBasic(secret), {
        timeout: 5,
        execute: [
          ...(localHttp ? [oidc.allowInsecureRequests] : []),
          oidc.enableNonRepudiationChecks,
        ],
        [oidc.customFetch]: (url, options) => {
          const target = new URL(url);
          if (target.origin !== issuer.origin || target.username || target.password) {
            throw new Error('Unexpected OIDC endpoint');
          }
          // Keep the public issuer in the protocol; only the connection uses Docker DNS.
          const address = new URL(transport.origin);
          address.pathname = target.pathname;
          address.search = target.search;
          if (options.body != null && !(options.body instanceof URLSearchParams) && typeof options.body !== 'string') {
            throw new Error('Unexpected OIDC request body');
          }
          return fetch(address, { ...options, body: options.body as URLSearchParams | string | undefined });
        },
      });
  }
}
