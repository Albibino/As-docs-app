import { useMemo } from "react";
import { useParams } from "react-router-dom";
import { useBacklinksQuery } from "@/features/page-details/queries/backlinks-query.ts";
import type { IBacklinkPageItem } from "@/features/page-details/types/backlink.types.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { usePageQuery } from "@/features/page/queries/page-query.ts";
import { extractPageSlugId } from "@/lib";
import { PageGraphNodeInput, PageGraphView } from "./page-graph-view";

const MAX_VISIBLE_NEIGHBORS = 32;

export function LocalPageGraph() {
  const { pageSlug } = useParams();
  const pageSlugId = extractPageSlugId(pageSlug);
  const { data: page } = usePageQuery({ pageId: pageSlugId });
  const incomingQuery = useBacklinksQuery(page?.id, "incoming", !!page);
  const outgoingQuery = useBacklinksQuery(page?.id, "outgoing", !!page);

  const { neighbors, hiddenCount } = useMemo(() => {
    const related = new Map<string, IBacklinkPageItem>();
    const addItems = (items: IBacklinkPageItem[]) => {
      for (const item of items) related.set(item.id, item);
    };

    addItems(incomingQuery.data?.pages.flatMap((result) => result.items) ?? []);
    addItems(outgoingQuery.data?.pages.flatMap((result) => result.items) ?? []);

    const allNeighbors = Array.from(related.values())
      .sort((left, right) =>
        (left.title ?? "").localeCompare(right.title ?? ""),
      )
      .map<PageGraphNodeInput>((item) => ({
        id: item.id,
        title: item.title,
        href: item.space?.slug
          ? buildPageUrl(item.space.slug, item.slugId, item.title ?? undefined)
          : null,
      }));

    return {
      neighbors: allNeighbors.slice(0, MAX_VISIBLE_NEIGHBORS),
      hiddenCount: Math.max(0, allNeighbors.length - MAX_VISIBLE_NEIGHBORS),
    };
  }, [incomingQuery.data, outgoingQuery.data]);

  if (!pageSlug || !page) return null;

  return (
    <PageGraphView
      current={{
        id: page.id,
        title: page.title,
        isBase: page.isBase,
        href: null,
      }}
      neighbors={neighbors}
      hiddenCount={hiddenCount}
      isLoading={incomingQuery.isLoading || outgoingQuery.isLoading}
    />
  );
}
