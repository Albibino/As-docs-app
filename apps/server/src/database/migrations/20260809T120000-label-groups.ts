import { type Kysely, sql } from 'kysely';

/**
 * Extends the legacy free-form label tables in place. Existing label ids and
 * page assignments are deliberately preserved: old labels become
 * workspace-scoped, ungrouped labels in the new taxonomy.
 */
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('label_groups')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('name', 'varchar', (col) => col.notNull())
    .addColumn('slug', 'varchar', (col) => col.notNull())
    .addColumn('description', 'text')
    .addColumn('color', 'varchar')
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade'),
    )
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .alterTable('labels')
    .addColumn('slug', 'varchar')
    .addColumn('description', 'text')
    .addColumn('color', 'varchar')
    .addColumn('position', 'integer', (col) => col.notNull().defaultTo(0))
    .addColumn('group_id', 'uuid', (col) =>
      col.references('label_groups.id').onDelete('cascade'),
    )
    .addColumn('space_id', 'uuid', (col) =>
      col.references('spaces.id').onDelete('cascade'),
    )
    .addColumn('created_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();

  // PostgreSQL's NFD normalization plus the same U+0300–U+036F removal used
  // by runtime toLabelSlug keeps migration and application semantics aligned.
  // Keep one canonical slug for runtime lookup. Collisions use a reserved
  // underscore namespace (runtime slugs contain only [a-z0-9-]) plus the full
  // UUID, making them provably unique without a collision-prone fixed prefix.
  await sql`
    WITH normalized AS (
      SELECT
        id,
        workspace_id,
        COALESCE(
          NULLIF(
            trim(both '-' from regexp_replace(lower(regexp_replace(normalize(name, NFD), U&'[\\0300-\\036f]', '', 'g')), '[^a-z0-9]+', '-', 'g')),
            ''
          ),
          'label'
        ) AS base_slug
      FROM labels
    ), ranked AS (
      SELECT
        id,
        base_slug,
        row_number() OVER (
          PARTITION BY workspace_id, base_slug
          ORDER BY id
        ) AS duplicate_rank
      FROM normalized
    )
    UPDATE labels AS label
    SET slug = CASE
      WHEN ranked.duplicate_rank = 1 THEN ranked.base_slug
      ELSE '__legacy__' || replace(label.id::text, '-', '')
    END
    FROM ranked
    WHERE ranked.id = label.id
  `.execute(db);

  await db.schema.dropIndex('labels_workspace_id_type_name_unique').execute();
  await db.schema
    .alterTable('labels')
    .alterColumn('slug', (col) => col.setNotNull())
    .dropColumn('type')
    .execute();

  await db.schema
    .alterTable('page_labels')
    .addColumn('label_group_id', 'uuid', (col) =>
      col.references('label_groups.id').onDelete('cascade'),
    )
    .addColumn('added_by_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .execute();

  await sql`
    CREATE UNIQUE INDEX label_groups_workspace_slug_unique
      ON label_groups (workspace_id, slug) WHERE space_id IS NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX label_groups_space_slug_unique
      ON label_groups (space_id, slug) WHERE space_id IS NOT NULL
  `.execute(db);
  await db.schema
    .createIndex('label_groups_workspace_id_idx')
    .on('label_groups')
    .column('workspace_id')
    .execute();
  await db.schema
    .createIndex('label_groups_space_id_idx')
    .on('label_groups')
    .column('space_id')
    .execute();

  await sql`
    CREATE UNIQUE INDEX labels_workspace_slug_unique
      ON labels (workspace_id, slug) WHERE space_id IS NULL
  `.execute(db);
  await sql`
    CREATE UNIQUE INDEX labels_space_slug_unique
      ON labels (space_id, slug) WHERE space_id IS NOT NULL
  `.execute(db);
  await db.schema
    .createIndex('labels_group_id_idx')
    .on('labels')
    .column('group_id')
    .execute();
  await db.schema
    .createIndex('labels_workspace_id_idx')
    .on('labels')
    .column('workspace_id')
    .execute();
  await db.schema
    .createIndex('labels_space_id_idx')
    .on('labels')
    .column('space_id')
    .execute();

  // The denormalized group id is always derived from labels.group_id. This
  // trigger protects direct SQL and future code paths as well as this service.
  await sql`
    CREATE FUNCTION sync_page_label_group_id() RETURNS trigger AS $$
    BEGIN
      SELECT group_id INTO NEW.label_group_id
      FROM labels
      WHERE id = NEW.label_id
      FOR UPDATE;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER page_labels_sync_group_id
      BEFORE INSERT OR UPDATE OF label_id, label_group_id ON page_labels
      FOR EACH ROW EXECUTE FUNCTION sync_page_label_group_id()
  `.execute(db);
  await sql`
    CREATE FUNCTION sync_label_assignment_group_ids() RETURNS trigger AS $$
    BEGIN
      UPDATE page_labels
      SET label_group_id = NEW.group_id
      WHERE label_id = NEW.id;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `.execute(db);
  await sql`
    CREATE TRIGGER labels_sync_assignment_group_ids
      AFTER UPDATE OF group_id ON labels
      FOR EACH ROW
      WHEN (OLD.group_id IS DISTINCT FROM NEW.group_id)
      EXECUTE FUNCTION sync_label_assignment_group_ids()
  `.execute(db);

  await sql`
    CREATE UNIQUE INDEX page_labels_page_group_unique
      ON page_labels (page_id, label_group_id) WHERE label_group_id IS NOT NULL
  `.execute(db);
  await db.schema
    .createIndex('page_labels_page_id_idx')
    .on('page_labels')
    .column('page_id')
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await sql`DROP TRIGGER labels_sync_assignment_group_ids ON labels`.execute(
    db,
  );
  await sql`DROP FUNCTION sync_label_assignment_group_ids()`.execute(db);
  await sql`DROP TRIGGER page_labels_sync_group_id ON page_labels`.execute(db);
  await sql`DROP FUNCTION sync_page_label_group_id()`.execute(db);

  await db.schema.dropIndex('page_labels_page_group_unique').execute();
  await db.schema.dropIndex('page_labels_page_id_idx').execute();
  await db.schema
    .alterTable('page_labels')
    .dropColumn('label_group_id')
    .dropColumn('added_by_id')
    .execute();

  await db.schema.dropIndex('labels_workspace_slug_unique').execute();
  await db.schema.dropIndex('labels_space_slug_unique').execute();
  await db.schema.dropIndex('labels_group_id_idx').execute();
  await db.schema.dropIndex('labels_workspace_id_idx').execute();
  await db.schema.dropIndex('labels_space_id_idx').execute();

  // The legacy model has one workspace namespace. Prefix every name with its
  // fixed-width complete UUID before recreating uniqueness. Distinct ids make
  // the mapping injective while retaining the prior display name as a suffix.
  await sql`
    UPDATE labels
    SET name = replace(id::text, '-', '') || ':' || name
  `.execute(db);

  await db.schema
    .alterTable('labels')
    .addColumn('type', 'varchar', (col) => col.notNull().defaultTo('page'))
    .dropColumn('slug')
    .dropColumn('description')
    .dropColumn('color')
    .dropColumn('position')
    .dropColumn('group_id')
    .dropColumn('space_id')
    .dropColumn('created_by_id')
    .execute();

  await db.schema
    .createIndex('labels_workspace_id_type_name_unique')
    .on('labels')
    .columns(['workspace_id', 'type', 'name'])
    .unique()
    .execute();

  await db.schema.dropTable('label_groups').execute();
}
