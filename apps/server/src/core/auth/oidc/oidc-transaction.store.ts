import { Injectable } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import { createHash } from 'node:crypto';

export const OIDC_TRANSACTION_SECONDS = 300;
const base64urlRandom = /^[A-Za-z0-9_-]{43}$/;

type LoginTransaction = { nonce: string; verifier: string; workspaceId: string };

@Injectable()
export class OidcTransactionStore {
  constructor(private readonly redis: RedisService) {}

  async save(state: string, browser: string, tx: LoginTransaction) {
    const result = await this.redis.getOrThrow().set(
      this.key(state, browser), JSON.stringify(tx), 'EX', OIDC_TRANSACTION_SECONDS, 'NX',
    );
    if (result !== 'OK') throw new Error('Unable to begin OIDC transaction');
  }

  async consume(state: string, browser: string): Promise<LoginTransaction | null> {
    if (!base64urlRandom.test(state) || !base64urlRandom.test(browser)) return null;
    const stored = await this.redis.getOrThrow().getdel(this.key(state, browser));
    return stored ? JSON.parse(stored) : null;
  }

  private key(state: string, browser: string) {
    const digest = createHash('sha256').update(`${state}:${browser}`).digest('hex');
    return `oidc:login:${digest}`;
  }
}
