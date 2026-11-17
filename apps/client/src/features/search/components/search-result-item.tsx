import React from "react";
import { Group, Center, Text, Badge } from "@mantine/core";
import { Spotlight } from "@mantine/spotlight";
import { Link } from "react-router-dom";
import { buildPageUrl } from "@/features/page/page.utils";
import { getPageIcon } from "@/lib";
import { IPageSearch } from "@/features/search/types/search.types";
import DOMPurify from "dompurify";
import { LabelChip } from "@/features/label/components/label-chip.tsx";

interface SearchResultItemProps {
  result: IPageSearch;
  showSpace?: boolean;
}

export function SearchResultItem({ result, showSpace }: SearchResultItemProps) {
  return (
    <Spotlight.Action
      component={Link}
      //@ts-ignore
      to={buildPageUrl(
        result.space.slug,
        result.slugId,
        result.title,
      )}
      style={{ userSelect: "none" }}
    >
      <Group wrap="nowrap" w="100%">
        <Center>{getPageIcon(result?.icon)}</Center>

        <div style={{ flex: 1 }}>
          <Text>{result.title}</Text>

          {(showSpace || result.labels?.length) && (
            <Group gap={4} mt={4}>
              {showSpace && result.space && (
                <Badge variant="light" size="xs" color="gray">
                  {result.space.name}
                </Badge>
              )}
              {result.labels?.slice(0, 3).map((label) => (
                <LabelChip key={label.id} label={label} />
              ))}
              {(result.labels?.length ?? 0) > 3 && (
                <Text size="xs" c="dimmed">
                  +{result.labels!.length - 3}
                </Text>
              )}
            </Group>
          )}

          {result?.highlight && (
            <Text
              opacity={0.6}
              size="xs"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(result.highlight, {
                  ALLOWED_TAGS: ["mark", "em", "strong", "b"],
                  ALLOWED_ATTR: [],
                }),
              }}
            />
          )}
        </div>
      </Group>
    </Spotlight.Action>
  );
}
