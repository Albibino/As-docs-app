import { OidcTransactionStore } from './oidc-transaction.store';

it('consumes the transaction only once and only for the initiating browser', async () => {
  const values = new Map<string, string>();
  const redis = {
    set: jest.fn(async (key, value) => {
      values.set(key, value);
      return 'OK';
    }),
    getdel: jest.fn(async (key) => {
      const value = values.get(key);
      values.delete(key);
      return value ?? null;
    }),
  };
  const store = new OidcTransactionStore({ getOrThrow: () => redis } as any);
  const state = 's'.repeat(43);
  const browser = 'b'.repeat(43);
  const tx = { nonce: 'nonce', verifier: 'verifier', workspaceId: 'workspace' };
  await store.save(state, browser, tx);
  expect(redis.set).toHaveBeenCalledWith(expect.any(String), expect.any(String), 'EX', 300, 'NX');
  await expect(store.consume(state, 'x'.repeat(43))).resolves.toBeNull();
  await expect(store.consume(state, browser)).resolves.toEqual(tx);
  await expect(store.consume(state, browser)).resolves.toBeNull();
});
