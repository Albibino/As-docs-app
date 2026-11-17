import { type Kysely, sql } from 'kysely';

/**
 * Lets a template decide what labels a page starts with, and which groups the
 * author still has to answer.
 */
export async function up(db: Kysely<any>): Promise<void> {
  // Labels applied automatically to pages created from the template.
  await db.schema
    .createTable('template_labels')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('template_id', 'uuid', (col) =>
      col.references('templates.id').onDelete('cascade').notNull(),
    )
    .addColumn('label_id', 'uuid', (col) =>
      col.references('labels.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('template_labels_template_id_label_id_unique', [
      'template_id',
      'label_id',
    ])
    .execute();

  await db.schema
    .createIndex('template_labels_template_id_idx')
    .on('template_labels')
    .column('template_id')
    .execute();
  await db.schema
    .createIndex('template_labels_label_id_idx')
    .on('template_labels')
    .column('label_id')
    .execute();

  // Groups the author must answer. Independent of the table above: a group can
  // be required and preselected, required and blank, or preselected and free.
  await db.schema
    .createTable('template_required_groups')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('template_id', 'uuid', (col) =>
      col.references('templates.id').onDelete('cascade').notNull(),
    )
    .addColumn('label_group_id', 'uuid', (col) =>
      col.references('label_groups.id').onDelete('cascade').notNull(),
    )
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('template_required_groups_unique', [
      'template_id',
      'label_group_id',
    ])
    .execute();

  await db.schema
    .createIndex('template_required_groups_template_id_idx')
    .on('template_required_groups')
    .column('template_id')
    .execute();
  await db.schema
    .createIndex('template_required_groups_label_group_id_idx')
    .on('template_required_groups')
    .column('label_group_id')
    .execute();

  // Snapshot of the required groups at creation time, rather than a join back
  // to the template: editing a template later must not retroactively change
  // what already-created pages are being asked for.
  await db.schema
    .alterTable('pages')
    .addColumn('required_label_group_ids', sql`uuid[]`)
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .dropColumn('required_label_group_ids')
    .execute();
  await db.schema.dropTable('template_required_groups').execute();
  await db.schema.dropTable('template_labels').execute();
}
