import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { jsonObjectFrom } from 'kysely/helpers/postgres';
import { sql } from 'kysely';
import { Label, Page } from '@tcc-docs/db/types/entity.types';
import { LabelWithTree } from '@tcc-docs/db/repos/label/label.repo';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import { PaginationOptions } from '@tcc-docs/db/pagination/pagination-options';
import { executeWithCursorPagination } from '@tcc-docs/db/pagination/cursor-pagination';
import {
  AuditEvent,
  AuditEventType,
  AuditResource,
} from '../../common/events/audit-events';

/**
 * Writes label activity straight into the `audit` table.
 *
 * TCC: é o único escritor da tabela `audit` (o módulo genérico de auditoria
 * foi removido). Ela guarda o histórico de labels mostrado no painel de
 * detalhes da página.
 */
@Injectable()
export class LabelAuditService {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  /**
   * Label name and colour are copied into `changes` rather than referenced.
   * A label can be deleted by an admin later, and history that dissolves when
   * that happens is not history.
   */
  private snapshot(label: Label | LabelWithTree) {
    return {
      id: label.id,
      name: label.name,
      color: label.color,
      treeId: label.treeId,
      parentId: label.parentId,
      kind: label.kind,
      treeName: 'tree' in label ? (label.tree?.name ?? null) : null,
    };
  }

  async logLabelApplied(
    page: Page,
    label: Label | LabelWithTree,
    actorId: string,
    replaced?: Label | LabelWithTree,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await this.write(
      {
        workspaceId: page.workspaceId,
        actorId,
        event: replaced
          ? AuditEvent.PAGE_LABEL_REPLACED
          : AuditEvent.PAGE_LABEL_ADDED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        changes: {
          before: replaced ? { label: this.snapshot(replaced) } : undefined,
          after: { label: this.snapshot(label) },
        },
      },
      trx,
    );
  }

  async logLabelRemoved(
    page: Page,
    label: Label | LabelWithTree,
    actorId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await this.write(
      {
        workspaceId: page.workspaceId,
        actorId,
        event: AuditEvent.PAGE_LABEL_REMOVED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        changes: { before: { label: this.snapshot(label) } },
      },
      trx,
    );
  }

  async logTaxonomySelection(
    page: Page,
    before: PathSnapshot | null,
    after: PathSnapshot | null,
    actorId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await this.write(
      {
        workspaceId: page.workspaceId,
        actorId,
        event: before && after
          ? AuditEvent.PAGE_LABEL_REPLACED
          : after
            ? AuditEvent.PAGE_LABEL_ADDED
            : AuditEvent.PAGE_LABEL_REMOVED,
        resourceType: AuditResource.PAGE,
        resourceId: page.id,
        spaceId: page.spaceId,
        changes: {
          before: before ? { path: this.pathSnapshot(before) } : undefined,
          after: after ? { path: this.pathSnapshot(after) } : undefined,
        },
      },
      trx,
    );
  }

  async logAssignmentsRemovedForLabels(
    labelIds: string[],
    actorId: string,
    reason: 'label-deleted' | 'tree-deleted' | 'node-deleted',
    trx: KyselyTransaction,
  ): Promise<void> {
    if (labelIds.length === 0) return;
    await sql`
      INSERT INTO audit (
        workspace_id, actor_id, actor_type, event, resource_type,
        resource_id, space_id, changes
      )
      SELECT
        pages.workspace_id,
        ${actorId}::uuid,
        'user',
        ${AuditEvent.PAGE_LABEL_REMOVED},
        ${AuditResource.PAGE},
        pages.id,
        pages.space_id,
        jsonb_build_object(
          'before', jsonb_build_object(
            'label', jsonb_build_object(
              'id', labels.id,
              'name', labels.name,
              'color', labels.color,
              'treeId', labels.tree_id,
              'treeName', label_trees.name
            )
          ),
          'reason', ${reason}::text
        )
      FROM page_labels
      INNER JOIN pages ON pages.id = page_labels.page_id
      INNER JOIN labels ON labels.id = page_labels.label_id
      LEFT JOIN label_trees ON label_trees.id = labels.tree_id
      WHERE page_labels.label_id = ANY(${labelIds}::uuid[])
    `.execute(trx);
  }

  async logTreeOnlyAssignmentsRemoved(
    treeId: string,
    actorId: string,
    reason: 'tree-deleted',
    trx: KyselyTransaction,
  ): Promise<void> {
    await sql`
      INSERT INTO audit (
        workspace_id, actor_id, actor_type, event, resource_type,
        resource_id, space_id, changes
      )
      SELECT
        pages.workspace_id,
        ${actorId}::uuid,
        'user',
        ${AuditEvent.PAGE_LABEL_REMOVED},
        ${AuditResource.PAGE},
        pages.id,
        pages.space_id,
        jsonb_build_object(
          'before', jsonb_build_object(
            'path', jsonb_build_array(label_trees.name)
          ),
          'reason', ${reason}::text
        )
      FROM page_labels
      INNER JOIN pages ON pages.id = page_labels.page_id
      INNER JOIN label_trees ON label_trees.id = page_labels.label_tree_id
      WHERE page_labels.label_tree_id = ${treeId}::uuid
        AND page_labels.label_id IS NULL
    `.execute(trx);
  }

  async logAssignmentsRemovedForPageMove(
    pageIds: string[],
    destinationSpaceId: string,
    actorId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    if (pageIds.length === 0) return;
    await sql`
      INSERT INTO audit (
        workspace_id, actor_id, actor_type, event, resource_type,
        resource_id, space_id, changes
      )
      SELECT
        pages.workspace_id,
        ${actorId}::uuid,
        'user',
        ${AuditEvent.PAGE_LABEL_REMOVED},
        ${AuditResource.PAGE},
        pages.id,
        pages.space_id,
        jsonb_build_object(
          'before', jsonb_build_object(
            'label', jsonb_build_object(
              'id', labels.id,
              'name', labels.name,
              'color', labels.color,
              'treeId', labels.tree_id,
              'treeName', label_trees.name
            )
          ),
          'reason', 'page-moved'
        )
      FROM page_labels
      INNER JOIN pages ON pages.id = page_labels.page_id
      INNER JOIN labels ON labels.id = page_labels.label_id
      LEFT JOIN label_trees ON label_trees.id = labels.tree_id
      WHERE page_labels.page_id = ANY(${pageIds}::uuid[])
        AND labels.space_id IS NOT NULL
        AND labels.space_id <> ${destinationSpaceId}::uuid
    `.execute(trx);
  }

  async logTreeOnlyAssignmentsRemovedForPageMove(
    pageIds: string[],
    destinationSpaceId: string,
    actorId: string,
    trx: KyselyTransaction,
  ): Promise<void> {
    if (pageIds.length === 0) return;
    await sql`
      INSERT INTO audit (
        workspace_id, actor_id, actor_type, event, resource_type,
        resource_id, space_id, changes
      )
      SELECT
        pages.workspace_id,
        ${actorId}::uuid,
        'user',
        ${AuditEvent.PAGE_LABEL_REMOVED},
        ${AuditResource.PAGE},
        pages.id,
        pages.space_id,
        jsonb_build_object(
          'before', jsonb_build_object(
            'path', jsonb_build_array(label_trees.name)
          ),
          'reason', 'page-moved'
        )
      FROM page_labels
      INNER JOIN pages ON pages.id = page_labels.page_id
      INNER JOIN label_trees ON label_trees.id = page_labels.label_tree_id
      WHERE page_labels.page_id = ANY(${pageIds}::uuid[])
        AND page_labels.label_id IS NULL
        AND label_trees.space_id IS NOT NULL
        AND label_trees.space_id <> ${destinationSpaceId}::uuid
    `.execute(trx);
  }

  /** Admin-side taxonomy edits, keyed to the label or group they touched. */
  async logTaxonomyChange(opts: {
    workspaceId: string;
    actorId: string;
    event: AuditEventType;
    resourceType: string;
    resourceId: string;
    spaceId?: string | null;
    changes?: Record<string, unknown>;
    trx?: KyselyTransaction;
  }): Promise<void> {
    await this.write(
      {
        workspaceId: opts.workspaceId,
        actorId: opts.actorId,
        event: opts.event,
        resourceType: opts.resourceType,
        resourceId: opts.resourceId,
        spaceId: opts.spaceId ?? undefined,
        changes: opts.changes,
      },
      opts.trx,
    );
  }

  /**
   * One page's label history, newest first. Restricted to the label events so
   * unrelated page audit rows never leak into the panel.
   */
  async findPageLabelHistory(
    pageId: string,
    workspaceId: string,
    pagination: PaginationOptions,
  ) {
    const query = this.db
      .selectFrom('audit')
      .select((eb) => [
        'audit.id',
        'audit.event',
        'audit.changes',
        'audit.createdAt',
        jsonObjectFrom(
          eb
            .selectFrom('users')
            .select(['users.id', 'users.name', 'users.avatarUrl'])
            .whereRef('users.id', '=', 'audit.actorId'),
        ).as('actor'),
      ])
      .where('audit.workspaceId', '=', workspaceId)
      .where('audit.resourceType', '=', AuditResource.PAGE)
      .where('audit.resourceId', '=', pageId)
      .where('audit.event', 'in', [
        AuditEvent.PAGE_LABEL_ADDED,
        AuditEvent.PAGE_LABEL_REMOVED,
        AuditEvent.PAGE_LABEL_REPLACED,
      ]);

    return executeWithCursorPagination(query, {
      perPage: pagination.limit,
      cursor: pagination.cursor,
      beforeCursor: pagination.beforeCursor,
      fields: [{ expression: 'audit.id', direction: 'desc', key: 'id' }],
      parseCursor: (cursor) => ({ id: cursor.id }),
    });
  }

  private async write(
    row: {
      workspaceId: string;
      actorId: string;
      event: string;
      resourceType: string;
      resourceId: string;
      spaceId?: string;
      changes?: Record<string, unknown>;
    },
    trx?: KyselyTransaction,
  ): Promise<void> {
    const db = dbOrTx(this.db, trx);
    await db
      .insertInto('audit')
      .values({
        workspaceId: row.workspaceId,
        actorId: row.actorId,
        actorType: 'user',
        event: row.event,
        resourceType: row.resourceType,
        resourceId: row.resourceId,
        spaceId: row.spaceId ?? null,
        changes: row.changes ? (row.changes as any) : null,
      })
      .execute();
  }

  private pathSnapshot(path: PathSnapshot) {
    return {
      treeId: path.tree.id,
      treeName: path.tree.name,
      selectedNodeId: path.selectedNodeId,
      nodes: path.nodes.map((node) => ({
        id: node.id,
        name: node.name,
        kind: node.kind,
      })),
    };
  }
}

type PathSnapshot = {
  tree: { id: string; name: string };
  selectedNodeId: string | null;
  nodes: Array<{ id: string; name: string; kind: string }>;
};
