import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('page_property_definitions')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('name', 'text', (col) => col.notNull())
    .addColumn('type', 'text', (col) => col.notNull())
    .addColumn('config', 'jsonb', (col) =>
      col.notNull().defaultTo(sql`'{}'::jsonb`),
    )
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addCheckConstraint(
      'page_property_definitions_type_check',
      sql`type IN ('date', 'number', 'person')`,
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX page_property_definitions_space_name_unique
      ON page_property_definitions (space_id, lower(name))
  `.execute(db);
  await db.schema
    .createIndex('page_property_definitions_space_position_idx')
    .on('page_property_definitions')
    .columns(['space_id', 'position', 'id'])
    .execute();

  await db.schema
    .createTable('page_property_values')
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    .addColumn('property_id', 'uuid', (col) =>
      col
        .references('page_property_definitions.id')
        .onDelete('cascade')
        .notNull(),
    )
    .addColumn('value', 'jsonb', (col) => col.notNull())
    .addColumn('updated_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.defaultTo(sql`now()`).notNull(),
    )
    .addPrimaryKeyConstraint('page_property_values_pkey', [
      'page_id',
      'property_id',
    ])
    .execute();

  await db.schema
    .createIndex('page_property_values_property_page_idx')
    .on('page_property_values')
    .columns(['property_id', 'page_id'])
    .execute();
  await sql`
    CREATE INDEX page_property_values_value_gin_idx
      ON page_property_values USING gin (value jsonb_path_ops)
  `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('page_property_values').execute();
  await db.schema.dropTable('page_property_definitions').execute();
}
