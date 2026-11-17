import { CollabHistoryService } from './collab-history.service';

describe('CollabHistoryService restore state', () => {
  function setup() {
    const multi = {
      sadd: jest.fn(),
      expire: jest.fn(),
      del: jest.fn(),
      exec: jest.fn().mockResolvedValue([[null, 1]]),
    };
    multi.sadd.mockReturnValue(multi);
    multi.expire.mockReturnValue(multi);
    multi.del.mockReturnValue(multi);

    const redis = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue('OK'),
      del: jest.fn().mockResolvedValue(1),
      eval: jest.fn().mockResolvedValue(1),
      multi: jest.fn().mockReturnValue(multi),
      scard: jest.fn(),
      spop: jest.fn(),
    };
    const service = new CollabHistoryService({
      getOrThrow: () => redis,
    } as any);

    return { service, redis, multi };
  }

  it('stores and reads a pending restore marker for 24 hours', async () => {
    const { service, redis } = setup();
    const state = {
      token: 'restore-token',
      targetRevisionId: 'revision-target',
      snapshotId: 'snapshot-1',
      markedAt: 1_700_000_000_000,
    };
    redis.get.mockResolvedValue(JSON.stringify(state));

    await service.markRestorePending('page-1', state);

    expect(redis.set).toHaveBeenCalledWith(
      'history:restore-state:page-1',
      JSON.stringify(state),
      'EX',
      86_400,
    );
    await expect(service.getRestorePending('page-1')).resolves.toEqual(state);
  });

  it('reserves a restore request atomically with an owner and a short lease', async () => {
    const { service, redis } = setup();

    await expect(
      service.reserveRestoreRequest('page-1', 'request-1', 'reservation-1'),
    ).resolves.toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      'history:restore-request:page-1:request-1',
      JSON.stringify({
        status: 'processing',
        reservationToken: 'reservation-1',
      }),
      'EX',
      30,
      'NX',
    );
  });

  it('persists only a complete idempotent result and reads it back', async () => {
    const { service, redis } = setup();
    const result = {
      status: 'done' as const,
      snapshotId: 'snapshot-1',
      targetRevisionId: 'revision-target',
      restoreToken: 'restore-token',
    };
    redis.get.mockResolvedValue(JSON.stringify(result));

    await expect(
      service.completeRestoreRequest(
        'page-1',
        'request-1',
        'reservation-1',
        result,
      ),
    ).resolves.toBe(true);

    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("current['reservationToken'] == ARGV[1]"),
      1,
      'history:restore-request:page-1:request-1',
      'reservation-1',
      JSON.stringify(result),
      '86400',
    );
    await expect(
      service.getRestoreRequest('page-1', 'request-1'),
    ).resolves.toEqual(result);
  });

  it('deletes a pending marker only when its token still matches', async () => {
    const { service, redis } = setup();

    await expect(
      service.clearRestorePending('page-1', 'restore-token'),
    ).resolves.toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("state['token'] == ARGV[1]"),
      1,
      'history:restore-state:page-1',
      'restore-token',
    );
  });

  it('keeps a newer pending marker when an older token tries to clear it', async () => {
    const { service, redis } = setup();
    redis.eval.mockResolvedValue(0);

    await expect(
      service.clearRestorePending('page-1', 'old-token'),
    ).resolves.toBe(false);
  });

  it('does not clear a newer marker when contributors update during cleanup', async () => {
    const values = new Map<string, string>();
    let enterEval: () => void;
    let releaseEval: () => void;
    const evalEntered = new Promise<void>((resolve) => (enterEval = resolve));
    const evalReleased = new Promise<void>(
      (resolve) => (releaseEval = resolve),
    );
    const { service, redis } = setup();
    redis.set.mockImplementation(async (key: string, value: string) => {
      values.set(key, value);
      return 'OK';
    });
    redis.get.mockImplementation(async (key: string) => values.get(key));
    redis.eval.mockImplementation(
      async (
        _script: string,
        _keyCount: number,
        key: string,
        token: string,
      ) => {
        enterEval();
        await evalReleased;
        const state = JSON.parse(values.get(key) ?? 'null');
        if (state?.token !== token) return 0;
        values.delete(key);
        return 1;
      },
    );
    const oldState = {
      token: 'old-token',
      targetRevisionId: 'revision-old',
      snapshotId: 'snapshot-old',
      markedAt: 1_700_000_000_000,
    };
    const newState = {
      token: 'new-token',
      targetRevisionId: 'revision-new',
      snapshotId: 'snapshot-new',
      markedAt: 1_700_000_000_100,
    };
    await service.markRestorePending('page-1', oldState);

    const cleanup = service.clearRestorePending('page-1', 'old-token');
    await evalEntered;
    await service.addContributors('page-other', ['user-1']);
    await service.markRestorePending('page-1', newState);
    releaseEval();

    await expect(cleanup).resolves.toBe(false);
    await expect(service.getRestorePending('page-1')).resolves.toEqual(
      newState,
    );
  });

  it('allows only one of two parallel cleanups to delete the same marker', async () => {
    let marker: string | undefined = JSON.stringify({
      token: 'restore-token',
      targetRevisionId: 'revision-target',
      snapshotId: 'snapshot-1',
      markedAt: 1_700_000_000_000,
    });
    const { service, redis } = setup();
    redis.eval.mockImplementation(
      async (
        _script: string,
        _keyCount: number,
        _key: string,
        token: string,
      ) => {
        const state = marker ? JSON.parse(marker) : undefined;
        if (state?.token !== token) return 0;
        marker = undefined;
        return 1;
      },
    );

    await expect(
      Promise.all([
        service.clearRestorePending('page-1', 'restore-token'),
        service.clearRestorePending('page-1', 'restore-token'),
      ]),
    ).resolves.toEqual([true, false]);
  });

  it('does not clear a restore request reserved by another owner', async () => {
    const { service, redis } = setup();
    redis.eval.mockResolvedValue(0);

    await expect(
      service.clearRestoreRequest('page-1', 'request-1', 'reservation-old'),
    ).resolves.toBe(false);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining("current['reservationToken'] == ARGV[1]"),
      1,
      'history:restore-request:page-1:request-1',
      'reservation-old',
    );
  });

  it('does not complete a restore request reserved by another owner', async () => {
    const { service, redis } = setup();
    redis.eval.mockResolvedValue(0);

    await expect(
      service.completeRestoreRequest('page-1', 'request-1', 'reservation-old', {
        status: 'done',
        snapshotId: 'snapshot-1',
        targetRevisionId: 'revision-target',
      }),
    ).resolves.toBe(false);
  });

  it('refreshes the contributors TTL whenever contributors are added', async () => {
    const { service, multi } = setup();

    await service.addContributors('page-1', ['user-1', 'user-2']);

    expect(multi.sadd).toHaveBeenCalledWith(
      'history:contributors:page-1',
      'user-1',
      'user-2',
    );
    expect(multi.expire).toHaveBeenCalledWith(
      'history:contributors:page-1',
      86_400,
    );
    expect(multi.exec).toHaveBeenCalled();
  });
});
