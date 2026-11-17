import { afterTransactionCommit, executeTx } from './utils';

describe('executeTx post-commit callbacks', () => {
  it('runs registered side effects only after the transaction resolves', async () => {
    const order: string[] = [];
    const trx = {} as any;
    const db = {
      transaction: () => ({
        execute: async (callback: (trx: any) => Promise<unknown>) => {
          const result = await callback(trx);
          order.push('committed');
          return result;
        },
      }),
    } as any;

    await executeTx(db, async (ownedTrx) => {
      afterTransactionCommit(ownedTrx, () => {
        order.push('event');
      });
      order.push('mutation');
      return 'ok';
    });

    expect(order).toEqual(['mutation', 'committed', 'event']);
  });

  it('does not run side effects when the transaction rejects', async () => {
    const effect = jest.fn();
    const trx = {} as any;
    const db = {
      transaction: () => ({
        execute: async (callback: (trx: any) => Promise<unknown>) =>
          callback(trx),
      }),
    } as any;

    await expect(
      executeTx(db, async (ownedTrx) => {
        afterTransactionCommit(ownedTrx, effect);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(effect).not.toHaveBeenCalled();
  });
});
