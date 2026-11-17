import { Kysely, sql } from 'kysely';

// External share viewers must read an immutable published revision
// instead of the live `pages.content`. `page_history` already stores immutable,
// append-only snapshots and has no retention job, so it doubles as the revision
// store: `pages.published_revision_id` points at the revision served externally
// and `page_publications` keeps the audit trail of every pointer move.
//
// `audience`/`customer_key` are written now but only `public` is accepted at
// runtime — the `customer` audience arrives with the unified customer login
//, and shipping the columns up front avoids a second migration.
export async function up(db: Kysely<any>): Promise<void> {
  await db.schema
    .alterTable('pages')
    .addColumn('published_revision_id', 'uuid', (col) =>
      col.references('page_history.id').onDelete('set null'),
    )
    .execute();

  await db.schema
    .createIndex('pages_published_revision_id_idx')
    .on('pages')
    .column('published_revision_id')
    .execute();

  await db.schema
    .createTable('page_publications')
    .addColumn('id', 'uuid', (col) =>
      col.primaryKey().defaultTo(sql`gen_uuid_v7()`),
    )
    .addColumn('page_id', 'uuid', (col) =>
      col.references('pages.id').onDelete('cascade').notNull(),
    )
    // `publish` points at a revision; `unpublish` clears the pointer and
    // records the revision that was dropped in `previous_revision_id`.
    .addColumn('action', 'varchar', (col) => col.notNull())
    .addColumn('revision_id', 'uuid', (col) =>
      col.references('page_history.id').onDelete('set null'),
    )
    .addColumn('previous_revision_id', 'uuid', (col) =>
      col.references('page_history.id').onDelete('set null'),
    )
    .addColumn('audience', 'varchar', (col) =>
      col.notNull().defaultTo('public'),
    )
    .addColumn('customer_key', 'varchar')
    .addColumn('actor_user_id', 'uuid', (col) =>
      col.references('users.id').onDelete('set null'),
    )
    .addColumn('workspace_id', 'uuid', (col) =>
      col.references('workspaces.id').onDelete('cascade').notNull(),
    )
    .addColumn('published_at', 'timestamptz', (col) =>
      col.notNull().defaultTo(sql`now()`),
    )
    .execute();

  await db.schema
    .createIndex('page_publications_page_id_published_at_idx')
    .on('page_publications')
    .columns(['page_id', 'published_at desc'])
    .execute();

  await backfillExistingShares(db);
}

// Every page already reachable through a live share was being served from live
// content. Without a backfill they would all 404 the moment the read path
// switches to the published pointer, so publish their current state as-is.
async function backfillExistingShares(db: Kysely<any>): Promise<void> {
  // Mirrors ShareService.getShareTree + PageRepo
  // .getPageAndDescendantsExcludingRestricted: the shared page itself, plus
  // descendants only when `include_sub_pages`, never recursing past a
  // restricted page and never including one.
  await sql`DROP TABLE IF EXISTS eng1676_reachable_pages`.execute(db);
  await sql`
    CREATE TEMPORARY TABLE eng1676_reachable_pages AS
    WITH RECURSIVE reachable AS (
      SELECT
        p.id,
        s.include_sub_pages,
        EXISTS (SELECT 1 FROM page_access pa WHERE pa.page_id = p.id) AS is_restricted
      FROM shares s
      JOIN pages p ON p.id = s.page_id
      WHERE s.deleted_at IS NULL
        AND p.deleted_at IS NULL
      UNION
      SELECT
        c.id,
        r.include_sub_pages,
        EXISTS (SELECT 1 FROM page_access pa WHERE pa.page_id = c.id) AS is_restricted
      FROM reachable r
      JOIN pages c ON c.parent_page_id = r.id
      WHERE r.include_sub_pages IS TRUE
        AND r.is_restricted IS FALSE
        AND c.deleted_at IS NULL
    )
    SELECT DISTINCT id FROM reachable WHERE is_restricted IS FALSE
  `.execute(db);

  // A page edited less than one checkpoint interval ago may have no snapshot
  // yet. Seed one from the live row so there is always something to point at.
  await sql`
    INSERT INTO page_history (
      page_id, slug_id, title, content, icon, cover_photo,
      last_updated_by_id, space_id, workspace_id
    )
    SELECT
      p.id, p.slug_id, p.title, p.content, p.icon, p.cover_photo,
      COALESCE(p.last_updated_by_id, p.creator_id), p.space_id, p.workspace_id
    FROM pages p
    JOIN eng1676_reachable_pages r ON r.id = p.id
    WHERE NOT EXISTS (
      SELECT 1 FROM page_history h WHERE h.page_id = p.id
    )
  `.execute(db);

  await sql`
    UPDATE pages
    SET published_revision_id = latest.id
    FROM (
      SELECT DISTINCT ON (h.page_id) h.id, h.page_id
      FROM page_history h
      JOIN eng1676_reachable_pages r ON r.id = h.page_id
      ORDER BY h.page_id, h.created_at DESC, h.id DESC
    ) AS latest
    WHERE pages.id = latest.page_id
      AND pages.published_revision_id IS NULL
  `.execute(db);

  // actor_user_id stays NULL: the migration published these, not a person.
  await sql`
    INSERT INTO page_publications (
      page_id, action, revision_id, previous_revision_id,
      audience, actor_user_id, workspace_id
    )
    SELECT p.id, 'publish', p.published_revision_id, NULL, 'public', NULL, p.workspace_id
    FROM pages p
    JOIN eng1676_reachable_pages r ON r.id = p.id
    WHERE p.published_revision_id IS NOT NULL
  `.execute(db);

  await sql`DROP TABLE IF EXISTS eng1676_reachable_pages`.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
  await db.schema.dropTable('page_publications').execute();
  await db.schema
    .dropIndex('pages_published_revision_id_idx')
    .ifExists()
    .execute();
  await db.schema
    .alterTable('pages')
    .dropColumn('published_revision_id')
    .execute();
}
