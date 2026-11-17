import { Kysely } from 'kysely';

/**
 * Public sharing remains supported. This migration intentionally
 * preserves the historical `shares` and publication schema so fresh installs
 * retain the same behaviour and data model as before the hierarchy change.
 */
export async function up(_db: Kysely<any>): Promise<void> {}

export async function down(_db: Kysely<any>): Promise<void> {}
