import { Injectable } from '@nestjs/common';
import { InjectKysely } from 'nestjs-kysely';
import { sql } from 'kysely';
import { KyselyDB, KyselyTransaction } from '@tcc-docs/db/types/kysely.types';
import { dbOrTx } from '@tcc-docs/db/utils';
import {
  PagePropertyDefinition,
  PagePropertyValue,
} from '@tcc-docs/db/types/entity.types';

@Injectable()
export class PagePropertyRepo {
  constructor(@InjectKysely() private readonly db: KyselyDB) {}

  listDefinitions(spaceId: string, workspaceId: string) {
    return this.db
      .selectFrom('pagePropertyDefinitions')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where((eb) =>
        eb.or([eb('spaceId', 'is', null), eb('spaceId', '=', spaceId)]),
      )
      .orderBy(
        (eb) => eb.case().when('spaceId', 'is', null).then(0).else(1).end(),
        'asc',
      )
      .orderBy('position', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  listWorkspaceDefinitions(workspaceId: string) {
    return this.db
      .selectFrom('pagePropertyDefinitions')
      .selectAll()
      .where('workspaceId', '=', workspaceId)
      .where('spaceId', 'is', null)
      .orderBy('position', 'asc')
      .orderBy('id', 'asc')
      .execute();
  }

  findDefinition(id: string, workspaceId: string, trx?: KyselyTransaction) {
    return dbOrTx(this.db, trx)
      .selectFrom('pagePropertyDefinitions')
      .selectAll()
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .executeTakeFirst();
  }

  async createDefinition(input: {
    workspaceId: string;
    spaceId: string | null;
    name: string;
    type: string;
    config: unknown;
    createdById: string;
  }): Promise<PagePropertyDefinition> {
    let positionQuery = this.db
      .selectFrom('pagePropertyDefinitions')
      .select(sql<number>`coalesce(max(position), -1) + 1`.as('position'))
      .where('workspaceId', '=', input.workspaceId);
    positionQuery = input.spaceId
      ? positionQuery.where('spaceId', '=', input.spaceId)
      : positionQuery.where('spaceId', 'is', null);
    const position = await positionQuery.executeTakeFirstOrThrow();

    return this.db
      .insertInto('pagePropertyDefinitions')
      .values({
        ...input,
        config: this.jsonb(input.config),
        position: position.position,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  countValues(propertyId: string): Promise<number> {
    return this.db
      .selectFrom('pagePropertyValues')
      .select((eb) => eb.fn.countAll<number>().as('count'))
      .where('propertyId', '=', propertyId)
      .executeTakeFirstOrThrow()
      .then(({ count }) => Number(count));
  }

  updateDefinition(
    id: string,
    workspaceId: string,
    patch: { name?: string; config?: unknown; position?: number },
  ): Promise<PagePropertyDefinition | undefined> {
    return this.db
      .updateTable('pagePropertyDefinitions')
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.config !== undefined
          ? { config: this.jsonb(patch.config) }
          : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        updatedAt: new Date(),
      })
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .returningAll()
      .executeTakeFirst();
  }

  async deleteDefinition(id: string, workspaceId: string): Promise<void> {
    await this.db
      .deleteFrom('pagePropertyDefinitions')
      .where('id', '=', id)
      .where('workspaceId', '=', workspaceId)
      .execute();
  }

  listValues(pageId: string): Promise<PagePropertyValue[]> {
    return this.db
      .selectFrom('pagePropertyValues')
      .innerJoin(
        'pagePropertyDefinitions',
        'pagePropertyDefinitions.id',
        'pagePropertyValues.propertyId',
      )
      .innerJoin('pages', 'pages.id', 'pagePropertyValues.pageId')
      .selectAll('pagePropertyValues')
      .where('pagePropertyValues.pageId', '=', pageId)
      .whereRef('pagePropertyDefinitions.workspaceId', '=', 'pages.workspaceId')
      .where((eb) =>
        eb.or([
          eb('pagePropertyDefinitions.spaceId', 'is', null),
          eb('pagePropertyDefinitions.spaceId', '=', eb.ref('pages.spaceId')),
        ]),
      )
      .execute();
  }

  async deleteValue(
    pageId: string,
    propertyId: string,
    trx?: KyselyTransaction,
  ): Promise<void> {
    await dbOrTx(this.db, trx)
      .deleteFrom('pagePropertyValues')
      .where('pageId', '=', pageId)
      .where('propertyId', '=', propertyId)
      .execute();
  }

  upsertValue(
    input: {
      pageId: string;
      propertyId: string;
      value: unknown;
      updatedById: string;
    },
    trx?: KyselyTransaction,
  ): Promise<PagePropertyValue> {
    return dbOrTx(this.db, trx)
      .insertInto('pagePropertyValues')
      .values({
        ...input,
        value: this.jsonb(input.value),
      })
      .onConflict((oc) =>
        oc.columns(['pageId', 'propertyId']).doUpdateSet({
          value: this.jsonb(input.value),
          updatedById: input.updatedById,
          updatedAt: new Date(),
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
  }

  private jsonb(value: unknown) {
    return sql<any>`${JSON.stringify(value)}::text::jsonb`;
  }
}
