import { Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .createTable('file_task_items')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('file_task_id', 'uuid', (col) =>
      col.notNull().references('file_tasks.id').onDelete('cascade'),
    )
    .addColumn('relative_path', 'text', (col) => col.notNull())
    .addColumn('file_name', 'text', (col) => col.notNull())
    .addColumn('kind', 'varchar', (col) => col.notNull())
    .addColumn('status', 'varchar', (col) => col.notNull())
    .addColumn('mime_type', 'varchar')
    .addColumn('file_size', 'int8', (col) => col.notNull())
    .addColumn('sha256', 'varchar(64)')
    .addColumn('storage_path', 'text')
    .addColumn('duplicate_of_id', 'uuid', (col) =>
      col.references('file_task_items.id').onDelete('set null'),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('set null'),
    )
    .addColumn('attachment_id', 'uuid', (col) =>
      col.references('attachments.id').onDelete('set null'),
    )
    .addColumn('error_message', 'text')
    .addColumn('created_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addColumn('updated_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .addUniqueConstraint('file_task_items_task_path_unique', [
      'file_task_id',
      'relative_path',
    ])
    .execute();

  await db.schema
    .createIndex('idx_file_task_items_task_status')
    .on('file_task_items')
    .columns(['file_task_id', 'status'])
    .execute();

  await db.schema
    .createIndex('idx_file_task_items_task_sha256')
    .on('file_task_items')
    .columns(['file_task_id', 'sha256'])
    .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('file_task_items').ifExists().execute();
}
