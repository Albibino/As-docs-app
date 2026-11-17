import { Injectable } from '@nestjs/common';
import { RedisService } from '@nestjs-labs/nestjs-ioredis';
import type { Redis } from 'ioredis';

const REDIS_KEY_PREFIX = 'history:contributors:';
const RESTORE_STATE_KEY_PREFIX = 'history:restore-state:';
const RESTORE_REQUEST_KEY_PREFIX = 'history:restore-request:';
const HISTORY_STATE_TTL_SECONDS = 24 * 60 * 60;
const RESTORE_REQUEST_LEASE_TTL_SECONDS = 30;
const DELETE_RESTORE_STATE_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, state = pcall(cjson.decode, raw)
if ok and state['token'] == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;
const COMPLETE_RESTORE_REQUEST_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, current = pcall(cjson.decode, raw)
if not ok then return 0 end
if current['status'] == 'processing' and current['reservationToken'] == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
if raw == ARGV[2] then
  redis.call('EXPIRE', KEYS[1], ARGV[3])
  return 1
end
return 0
`;
const DELETE_RESTORE_REQUEST_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local ok, current = pcall(cjson.decode, raw)
if ok and current['status'] == 'processing' and current['reservationToken'] == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0
`;

export interface PageHistoryRestoreState {
  token: string;
  targetRevisionId: string;
  snapshotId: string;
  markedAt: number;
}

export interface PageHistoryRestoreRequestResult {
  status: 'processing' | 'done';
  reservationToken?: string;
  snapshotId?: string;
  targetRevisionId?: string;
  restoreToken?: string;
}

@Injectable()
export class CollabHistoryService {
  private readonly redis: Redis;

  constructor(private readonly redisService: RedisService) {
    this.redis = this.redisService.getOrThrow();
  }

  async addContributors(pageId: string, userIds: string[]): Promise<void> {
    if (userIds.length === 0) return;
    const key = REDIS_KEY_PREFIX + pageId;
    await this.redis
      .multi()
      .sadd(key, ...userIds)
      .expire(key, HISTORY_STATE_TTL_SECONDS)
      .exec();
  }

  async popContributors(pageId: string): Promise<string[]> {
    const key = REDIS_KEY_PREFIX + pageId;
    const count = await this.redis.scard(key);
    if (count === 0) return [];
    return await this.redis.spop(key, count);
  }

  async clearContributors(pageId: string): Promise<void> {
    await this.redis.del(REDIS_KEY_PREFIX + pageId);
  }

  async markRestorePending(
    pageId: string,
    state: PageHistoryRestoreState,
  ): Promise<void> {
    await this.redis.set(
      this.restoreStateKey(pageId),
      JSON.stringify(state),
      'EX',
      HISTORY_STATE_TTL_SECONDS,
    );
  }

  async getRestorePending(
    pageId: string,
  ): Promise<PageHistoryRestoreState | undefined> {
    return this.parseJson<PageHistoryRestoreState>(
      await this.redis.get(this.restoreStateKey(pageId)),
    );
  }

  async clearRestorePending(pageId: string, token: string): Promise<boolean> {
    const result = await this.redis.eval(
      DELETE_RESTORE_STATE_SCRIPT,
      1,
      this.restoreStateKey(pageId),
      token,
    );
    return result === 1;
  }

  async getRestoreRequest(
    pageId: string,
    requestId: string,
  ): Promise<PageHistoryRestoreRequestResult | undefined> {
    const result = this.parseJson<PageHistoryRestoreRequestResult>(
      await this.redis.get(this.restoreRequestKey(pageId, requestId)),
    );

    if (
      result &&
      !result.status &&
      result.snapshotId &&
      result.targetRevisionId
    ) {
      return { ...result, status: 'done' };
    }
    return result;
  }

  async reserveRestoreRequest(
    pageId: string,
    requestId: string,
    reservationToken: string,
  ): Promise<boolean> {
    const result = await this.redis.set(
      this.restoreRequestKey(pageId, requestId),
      JSON.stringify({ status: 'processing', reservationToken }),
      'EX',
      RESTORE_REQUEST_LEASE_TTL_SECONDS,
      'NX',
    );
    return result === 'OK';
  }

  async completeRestoreRequest(
    pageId: string,
    requestId: string,
    reservationToken: string,
    result: PageHistoryRestoreRequestResult & { status: 'done' },
  ): Promise<boolean> {
    const completed = await this.redis.eval(
      COMPLETE_RESTORE_REQUEST_SCRIPT,
      1,
      this.restoreRequestKey(pageId, requestId),
      reservationToken,
      JSON.stringify(result),
      String(HISTORY_STATE_TTL_SECONDS),
    );
    return completed === 1;
  }

  async clearRestoreRequest(
    pageId: string,
    requestId: string,
    reservationToken: string,
  ): Promise<boolean> {
    const deleted = await this.redis.eval(
      DELETE_RESTORE_REQUEST_SCRIPT,
      1,
      this.restoreRequestKey(pageId, requestId),
      reservationToken,
    );
    return deleted === 1;
  }

  private restoreStateKey(pageId: string): string {
    return RESTORE_STATE_KEY_PREFIX + pageId;
  }

  private restoreRequestKey(pageId: string, requestId: string): string {
    return `${RESTORE_REQUEST_KEY_PREFIX}${pageId}:${requestId}`;
  }

  private parseJson<T>(value: string | null): T | undefined {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as T;
    } catch {
      return undefined;
    }
  }
}
