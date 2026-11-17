import { Injectable } from '@nestjs/common';
import { SearchDTO, SearchSuggestionDTO } from './dto/search.dto';
import { SearchResponseDto } from './dto/search-response.dto';
import { InjectKysely } from 'nestjs-kysely';
import { KyselyDB } from '@tcc-docs/db/types/kysely.types';
import { sql } from 'kysely';
import { PageRepo } from '@tcc-docs/db/repos/page/page.repo';
import { SpaceMemberRepo } from '@tcc-docs/db/repos/space/space-member.repo';
import { PagePermissionRepo } from '@tcc-docs/db/repos/page/page-permission.repo';
import { LabelRepo } from '@tcc-docs/db/repos/label/label.repo';
import { LabelTreeRepo } from '@tcc-docs/db/repos/label/label-tree.repo';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tsquery = require('pg-tsquery')();

export function bucketLabelFilterIds(
  labels: Array<{ id: string; treeId: string | null }>,
): string[][] {
  const buckets = new Map<string, string[]>();
  for (const label of labels) {
    const key = label.treeId ?? `ungrouped:${label.id}`;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(label.id);
    else buckets.set(key, [label.id]);
  }
  return [...buckets.values()];
}

@Injectable()
export class SearchService {
  constructor(
    @InjectKysely() private readonly db: KyselyDB,
    private pageRepo: PageRepo,
    private spaceMemberRepo: SpaceMemberRepo,
    private pagePermissionRepo: PagePermissionRepo,
    private labelRepo: LabelRepo,
    private labelTreeRepo: LabelTreeRepo,
  ) {}

  /**
 * Narrows results to pages carrying the selected labels, bucketed by tree:
   * AND across groups, OR within one.
   *
   * A page can hold at most one endpoint per tree, so ANDing two labels from the
   * same tree would always return nothing — which is never what someone
   * ticking two options in a group means. Ungrouped labels each form their own
   * bucket and therefore still combine with AND.
   */
  private applyLabelFilter(
    query: any,
    labels: Array<{ id: string; treeId: string | null }>,
  ) {
    for (const ids of bucketLabelFilterIds(labels)) {
      query = query.where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('pageLabels')
            .select('pageLabels.id')
            .whereRef('pageLabels.pageId', '=', 'pages.id')
            .where((innerEb: any) =>
              innerEb.or([
                innerEb('pageLabels.labelId', 'in', ids),
                innerEb(
                  'pageLabels.labelId',
                  'in',
                  innerEb
                    .selectFrom('labelNodeClosures')
                    .select('labelNodeClosures.descendantId')
                    .where('labelNodeClosures.ancestorId', 'in', ids),
                ),
              ]),
            ),
        ),
      );
    }

    return query;
  }

  private applyTaxonomyFilter(
    query: any,
    filters: Array<{ treeId: string; nodeIds?: string[] }>,
  ) {
    for (const filter of filters) {
      query = query.where((eb: any) =>
        eb.exists(
          eb
            .selectFrom('pageLabels')
            .select('pageLabels.id')
            .whereRef('pageLabels.pageId', '=', 'pages.id')
            .where('pageLabels.labelTreeId', '=', filter.treeId)
            .$if((filter.nodeIds?.length ?? 0) > 0, (qb: any) =>
              qb.where('pageLabels.labelId', 'in', (nestedEb: any) =>
                nestedEb
                  .selectFrom('labelNodeClosures')
                  .select('labelNodeClosures.descendantId')
                  .where('labelNodeClosures.ancestorId', 'in', filter.nodeIds!),
              ),
            ),
        ),
      );
    }
    return query;
  }

  async enrichPageResultsWithLabels<T extends { id: string }>(items: T[]) {
    if (items.length === 0) return items;
    const labelsByPage = await this.labelRepo.findLabelsByPageIds(
      items.map((item) => item.id),
    );
    return items.map((item) => ({
      ...item,
      labels: labelsByPage.get(item.id) ?? [],
    }));
  }

  async searchPage(
    searchParams: SearchDTO,
    opts: {
      userId?: string;
      workspaceId: string;
    },
  ): Promise<{ items: SearchResponseDto[] }> {
    const { query } = searchParams;

    if (query.length < 1) {
      return { items: [] };
    }
    const searchQuery = tsquery(query.trim() + '*');

    let queryResults = this.db
      .selectFrom('pages')
      .select([
        'id',
        'slugId',
        'title',
        'icon',
        'parentPageId',
        'creatorId',
        'createdAt',
        'updatedAt',
        sql<number>`ts_rank(tsv, to_tsquery('english', f_unaccent(${searchQuery})))`.as(
          'rank',
        ),
        sql<string>`ts_headline('english', text_content, to_tsquery('english', f_unaccent(${searchQuery})),'MinWords=9, MaxWords=10, MaxFragments=3')`.as(
          'highlight',
        ),
      ])
      .where(
        'tsv',
        '@@',
        sql<string>`to_tsquery('english', f_unaccent(${searchQuery}))`,
      )
      .$if(Boolean(searchParams.creatorId), (qb) =>
        qb.where('creatorId', '=', searchParams.creatorId),
      )
      .where('deletedAt', 'is', null)
      .orderBy('rank', 'desc')
      .limit(searchParams.limit || 25)
      .offset(searchParams.offset || 0);

    queryResults = queryResults.select((eb) => this.pageRepo.withSpace(eb));

    if (searchParams.labelIds?.length) {
      if (!opts.userId) return { items: [] };

      const requestedIds = [...new Set(searchParams.labelIds)];
      const visibleLabels = await this.labelRepo.findVisibleForUser(
        opts.workspaceId,
        opts.userId,
      );
      const visibleById = new Map(
        visibleLabels.map((label) => [label.id, label]),
      );
      if (requestedIds.some((id) => !visibleById.has(id))) {
        return { items: [] };
      }

      queryResults = this.applyLabelFilter(
        queryResults,
        requestedIds
          .map((id) => visibleById.get(id)!)
          .filter((label) => label.treeId === null),
      );
    }

    if (searchParams.taxonomyFilters?.length) {
      if (!opts.userId) return { items: [] };
      const [visibleLabels, visibleTrees] = await Promise.all([
        this.labelRepo.findVisibleForUser(opts.workspaceId, opts.userId),
        this.labelTreeRepo.findVisibleForUser(opts.workspaceId, opts.userId),
      ]);
      const visibleTreeIds = new Set(visibleTrees.map((tree) => tree.id));
      const visibleNodes = new Map(
        visibleLabels
          .filter((label) => label.treeId !== null)
          .map((label) => [label.id, label]),
      );
      const filters = searchParams.taxonomyFilters.map((filter) => {
        if (!visibleTreeIds.has(filter.treeId)) return null;
        const nodeIds = [...new Set(filter.nodeIds ?? [])];
        if (nodeIds.some((id) => visibleNodes.get(id)?.treeId !== filter.treeId))
          return null;
        return { treeId: filter.treeId, nodeIds };
      });
      if (filters.some((filter) => filter === null)) return { items: [] };
      queryResults = this.applyTaxonomyFilter(
        queryResults,
        filters as Array<{ treeId: string; nodeIds: string[] }>,
      );
    }

    if (searchParams.spaceId) {
      // search by spaceId
      queryResults = queryResults.where('spaceId', '=', searchParams.spaceId);
    } else if (opts.userId && !searchParams.spaceId) {
      // only search spaces the user is a member of
      queryResults = queryResults
        .where(
          'spaceId',
          'in',
          this.spaceMemberRepo.getUserSpaceIdsQuery(opts.userId),
        )
        .where('workspaceId', '=', opts.workspaceId);
    } else {
      return { items: [] };
    }

    // Authorization belongs in SQL so inaccessible hits cannot consume the
    // requested LIMIT/OFFSET window and hide later accessible results.
    if (opts.userId) {
      queryResults = queryResults.where(
        this.pagePermissionRepo.accessiblePageCondition(opts.userId),
      );
    }

    //@ts-ignore
    let results: any[] = await queryResults.execute();

    if (opts.userId && results.length > 0) {
      results = await this.enrichPageResultsWithLabels(results);
    }

    //@ts-ignore
    const searchResults = results.map((result: SearchResponseDto) => {
      if (result.highlight) {
        result.highlight = result.highlight
          .replace(/\r\n|\r|\n/g, ' ')
          .replace(/\s+/g, ' ');
      }
      return result;
    });

    return { items: searchResults };
  }

  async searchSuggestions(
    suggestion: SearchSuggestionDTO,
    userId: string,
    workspaceId: string,
  ) {
    let users = [];
    let pages = [];

    const limit = suggestion?.limit || 10;
    const query = suggestion.query.toLowerCase().trim();

    if (suggestion.includeUsers) {
      const userQuery = this.db
        .selectFrom('users')
        .select(['id', 'name', 'email', 'avatarUrl'])
        .where('workspaceId', '=', workspaceId)
        .where('deletedAt', 'is', null)
        .where('deactivatedAt', 'is', null)
        .where((eb) =>
          eb.or([
            eb(
              sql`LOWER(f_unaccent(users.name))`,
              'like',
              sql`LOWER(f_unaccent(${`%${query}%`}))`,
            ),
            eb(sql`users.email`, 'ilike', sql`f_unaccent(${`%${query}%`})`),
          ]),
        )
        .limit(limit);

      users = await userQuery.execute();
    }

    if (suggestion.includePages) {
      let pageSearch = this.db
        .selectFrom('pages')
        .select(['id', 'slugId', 'title', 'icon', 'spaceId'])
        .select((eb) => this.pageRepo.withSpace(eb))
        .where((eb) =>
          eb(
            sql`LOWER(f_unaccent(pages.title))`,
            'like',
            sql`LOWER(f_unaccent(${`%${query}%`}))`,
          ),
        )
        .where('deletedAt', 'is', null)
        .where('workspaceId', '=', workspaceId);

      // search all spaces the user has access to, prioritizing the current space
      const userSpaceIds = await this.spaceMemberRepo.getUserSpaceIds(userId);

      if (userSpaceIds?.length > 0) {
        pageSearch = pageSearch
          .where('spaceId', 'in', userSpaceIds)
          // Apply page ACL before LIMIT so restricted pages cannot consume
          // suggestion slots and hide later pages the viewer can access.
          .where(this.pagePermissionRepo.accessiblePageCondition(userId))
          .limit(limit);

        if (suggestion?.spaceId) {
          pageSearch = pageSearch.orderBy(
            sql`CASE WHEN pages."space_id" = ${suggestion.spaceId} THEN 0 ELSE 1 END`,
            'asc',
          );
        }

        pages = await pageSearch.execute();
      }

      // Filter by page-level permissions
      if (pages.length > 0) {
        const pageIds = pages.map((p) => p.id);
        const accessibleIds =
          await this.pagePermissionRepo.filterAccessiblePageIds({
            pageIds,
            userId,
          });
        const accessibleSet = new Set(accessibleIds);
        pages = pages.filter((p) => accessibleSet.has(p.id));
      }
    }

    return { users, pages };
  }
}
