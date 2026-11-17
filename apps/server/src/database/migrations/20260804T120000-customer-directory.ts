import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('workspaces')
    .addColumn('directory_organization_key', 'varchar')
    .addColumn('clerk_organization_id', 'varchar')
    .execute();

  await db.schema
    .createIndex('workspaces_directory_organization_key_idx')
    .on('workspaces')
    .column('directory_organization_key')
    .execute();

  await db.schema
    .createTable('directory_event_receipts')
    .addColumn('event_id', 'varchar', (col) => col.primaryKey())
    .addColumn('payload_hash', 'varchar', (col) => col.notNull())
    .addColumn('event_type', 'varchar', (col) => col.notNull())
    .addColumn('occurred_at', 'bigint', (col) => col.notNull())
    .addColumn('version', 'integer', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('received_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('processed_at', 'timestamptz')
    .execute();

  await db.schema
    .createIndex('directory_event_receipts_payload_hash_idx')
    .on('directory_event_receipts')
    .column('payload_hash')
    .execute();

  await db.schema
    .createTable('organization_access_projections')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('projection_key', 'varchar', (col) => col.notNull())
    .addColumn('projection_kind', 'varchar', (col) => col.notNull())
    .addColumn('organization_key', 'varchar', (col) => col.notNull())
    .addColumn('clerk_organization_id', 'varchar')
    .addColumn('clerk_user_id', 'varchar')
    .addColumn('organization_name', 'varchar')
    .addColumn('organization_slug', 'varchar')
    .addColumn('organization_image_url', 'varchar')
    .addColumn('organization_status', 'varchar')
    .addColumn('product_key', 'varchar')
    .addColumn('product_status', 'varchar')
    .addColumn('organization_source_updated_at', 'bigint')
    .addColumn('product_source_updated_at', 'bigint')
    .addColumn('membership_role', 'varchar')
    .addColumn('membership_status', 'varchar')
    .addColumn('membership_source_updated_at', 'bigint')
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
    .createIndex('organization_access_projections_key_idx')
    .on('organization_access_projections')
    .column('projection_key')
    .unique()
    .execute();
  await db.schema
    .createIndex('organization_access_projections_org_kind_idx')
    .on('organization_access_projections')
    .columns(['organization_key', 'projection_kind'])
    .execute();
  await db.schema
    .createIndex('organization_access_projections_org_user_idx')
    .on('organization_access_projections')
    .columns(['organization_key', 'clerk_user_id'])
    .execute();
  await db.schema
    .createIndex('organization_access_projections_user_kind_idx')
    .on('organization_access_projections')
    .columns(['clerk_user_id', 'projection_kind'])
    .execute();

  await db.schema
    .createTable('principal_profile_projections')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('clerk_user_id', 'varchar', (col) => col.notNull())
    .addColumn('primary_email', 'varchar')
    .addColumn('display_name', 'varchar')
    .addColumn('image_url', 'varchar')
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
    .createIndex('principal_profile_projections_clerk_user_id_idx')
    .on('principal_profile_projections')
    .column('clerk_user_id')
    .unique()
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .dropTable('principal_profile_projections')
    .ifExists()
    .execute();
  await db.schema
    .dropTable('organization_access_projections')
    .ifExists()
    .execute();
  await db.schema.dropTable('directory_event_receipts').ifExists().execute();
  await db.schema
    .dropIndex('workspaces_directory_organization_key_idx')
    .ifExists()
    .execute();
  await db.schema
    .alterTable('workspaces')
    .dropColumn('clerk_organization_id')
    .dropColumn('directory_organization_key')
    .execute();
}
