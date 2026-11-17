import { KyselyDB, KyselyTransaction } from './types/kysely.types';

const afterCommitCallbacks = new WeakMap<
  KyselyTransaction,
  Array<() => void | Promise<void>>
>();

/** Queue a side effect that must run only after the owning transaction commits. */
export function afterTransactionCommit(
  trx: KyselyTransaction,
  callback: () => void | Promise<void>,
): void {
  const callbacks = afterCommitCallbacks.get(trx) ?? [];
  callbacks.push(callback);
  afterCommitCallbacks.set(trx, callbacks);
}

/*
 * Executes a transaction or a callback using the provided database instance.
 * If an existing transaction is provided, it directly executes the callback with it.
 * Otherwise, it starts a new transaction using the provided database instance and executes the callback within that transaction.
 */
export async function executeTx<T>(
  db: KyselyDB,
  callback: (trx: KyselyTransaction) => Promise<T>,
  existingTrx?: KyselyTransaction,
): Promise<T> {
  if (existingTrx) {
    return await callback(existingTrx); // The outer owner runs post-commit callbacks.
  }

  let ownedTrx: KyselyTransaction | undefined;
  const result = await db.transaction().execute(async (trx) => {
    ownedTrx = trx;
    return callback(trx);
  });
  if (ownedTrx) {
    const callbacks = afterCommitCallbacks.get(ownedTrx) ?? [];
    afterCommitCallbacks.delete(ownedTrx);
    for (const afterCommit of callbacks) await afterCommit();
  }
  return result;
}

/*
 * This function returns either an existing transaction if provided,
 * or the normal database instance.
 */
export function dbOrTx(
  db: KyselyDB,
  existingTrx?: KyselyTransaction,
): KyselyDB | KyselyTransaction {
  if (existingTrx) {
    return existingTrx; // Use existing transaction
  } else {
    return db; // Use normal database instance
  }
}
