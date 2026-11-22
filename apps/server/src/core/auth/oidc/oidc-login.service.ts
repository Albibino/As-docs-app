import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import type { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { UserRepo } from '@tcc-docs/db/repos/user/user.repo';
import { isUserDisabled } from '../../../common/helpers';
import { EnvironmentService } from '../../../integrations/environment/environment.service';
import { OidcProviderService } from '../../../integrations/oidc/oidc-provider.service';
import { SessionService } from '../../session/session.service';
import { TCC_USERS } from '../../tcc/tcc.constants';
import { OidcTransactionStore } from './oidc-transaction.store';

export const OIDC_CALLBACK = '/api/auth/oidc/callback';

@Injectable()
export class OidcLoginService {
  constructor(
    private readonly env: EnvironmentService,
    private readonly provider: OidcProviderService,
    private readonly transactions: OidcTransactionStore,
    @InjectKysely() private readonly db: KyselyDB,
    private readonly users: UserRepo,
    private readonly sessions: SessionService,
  ) {}

  async begin(workspaceId: string) {
    const oidc = await import('openid-client');
    const configuration = await this.configuration();
    const state = oidc.randomState();
    const browser = oidc.randomState();
    const nonce = oidc.randomNonce();
    const verifier = oidc.randomPKCECodeVerifier();
    const authorization = oidc.buildAuthorizationUrl(configuration, {
      redirect_uri: this.callbackUrl().href,
      scope: 'openid',
      prompt: 'login',
      state,
      nonce,
      code_challenge: await oidc.calculatePKCECodeChallenge(verifier),
      code_challenge_method: 'S256',
    });
    if (authorization.origin !== new URL(this.env.getOidcIssuer()).origin) {
      throw new Error('Unexpected OIDC authorization endpoint');
    }
    await this.transactions.save(state, browser, { nonce, verifier, workspaceId });
    return { authorization, browser };
  }

  async finish(workspaceId: string, browser: string, query: string): Promise<string> {
    const callback = this.callbackUrl();
    callback.search = query;
    const states = callback.searchParams.getAll('state');
    const transaction = states.length === 1 && await this.transactions.consume(states[0], browser);
    if (!transaction || transaction.workspaceId !== workspaceId) throw new UnauthorizedException();

    const oidc = await import('openid-client');
    const configuration = await this.configuration();
    const tokens = await oidc.authorizationCodeGrant(configuration, callback, {
      expectedState: states[0],
      expectedNonce: transaction.nonce,
      pkceCodeVerifier: transaction.verifier,
    });
    const claims = tokens.claims();
    if (!claims?.sub || claims.iss !== this.env.getOidcIssuer()) throw new UnauthorizedException();

    const account = await this.db.selectFrom('oidcAccounts').select('userId')
      .where('issuer', '=', claims.iss).where('subject', '=', claims.sub).executeTakeFirst();
    const user = account && await this.users.findById(account.userId, workspaceId);
    if (!user || isUserDisabled(user) || !TCC_USERS.some(({ email }) => email === user.email)) {
      throw new UnauthorizedException();
    }
    await this.users.updateLastLogin(user.id, workspaceId);
    return this.sessions.createSessionAndToken(user, 'oidc');
  }

  private configuration() {
    const { id, secret } = this.env.getOidcWebClient();
    return this.provider.configuration(id, secret);
  }

  private callbackUrl() {
    return new URL(OIDC_CALLBACK, this.env.getAppUrl());
  }
}
