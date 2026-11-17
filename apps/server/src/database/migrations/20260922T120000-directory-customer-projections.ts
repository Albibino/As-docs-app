import { Kysely, sql } from 'kysely';

/**
 * O app passa a manter uma projeção local dos clientes do
 * diretório externo em vez de consultar a integração de forma síncrona
 * no fluxo da UI (o que hoje falha porque o contrato de reconciliação do
 * Directory não aceita entityType "customers").
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('customer_directory_projections')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('customer_key', 'varchar', (col) => col.notNull())
    .addColumn('organization_key', 'varchar', (col) => col.notNull())
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('slug', 'varchar', (col) => col.notNull())
    .addColumn('domain', 'varchar')
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('source_updated_at', 'bigint', (col) => col.notNull())
    .addColumn('last_event_id', 'varchar', (col) => col.notNull())
    .addColumn('last_occurred_at', 'bigint', (col) => col.notNull())
    .addColumn('last_reconciled_at', 'timestamptz')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('customer_directory_projections_key_idx')
    .on('customer_directory_projections')
    .column('customer_key')
    .unique()
    .execute();

  await db.schema
    .createIndex('customer_directory_projections_org_status_idx')
    .on('customer_directory_projections')
    .columns(['organization_key', 'status'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable('customer_directory_projections')
    .ifExists()
    .execute();
}
