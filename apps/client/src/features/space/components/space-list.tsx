import { Badge, Button, Group, SegmentedControl, Table, Text } from "@mantine/core";
import React, { useState } from "react";
import {
  useGetSpacesQuery,
  useRestoreSpaceMutation,
} from "@/features/space/queries/space-query.ts";
import { formatMemberCount } from "@/lib";
import { useTranslation } from "react-i18next";
import { useLocation, useNavigate } from "react-router-dom";
import { getSpaceSettingsUrl } from "@/lib/config.ts";
import Paginate from "@/components/common/paginate.tsx";
import { SpaceAvatar } from "@/components/ui/space-avatar.tsx";
import { AutoTooltipText } from "@/components/ui/auto-tooltip-text.tsx";
import { SearchInput } from "@/components/common/search-input.tsx";
import NoTableResults from "@/components/common/no-table-results.tsx";
import { usePaginateAndSearch } from "@/hooks/use-paginate-and-search.tsx";
import rowClasses from "@/components/ui/clickable-table-row.module.css";

export default function SpaceList() {
  const { t } = useTranslation();
  const [showArchived, setShowArchived] = useState(false);
  const { search, cursor, goNext, goPrev, handleSearch } =
    usePaginateAndSearch();
  const { data } = useGetSpacesQuery({
    cursor,
    query: search,
    archived: showArchived,
  });
  const restoreMutation = useRestoreSpaceMutation();
  const location = useLocation();
  const navigate = useNavigate();

  const handleClick = (spaceSlug: string) => {
    navigate(getSpaceSettingsUrl(spaceSlug), {
      state: { settingsOrigin: location.pathname },
    });
  };

  return (
    <>
      <Group justify="space-between" align="flex-end" mb="md">
        <SearchInput onSearch={handleSearch} />
        <SegmentedControl
          aria-label={t("Space status")}
          value={showArchived ? "archived" : "active"}
          onChange={(value) => setShowArchived(value === "archived")}
          data={[
            { label: t("Active spaces"), value: "active" },
            { label: t("Archived spaces"), value: "archived" },
          ]}
        />
      </Group>
      <Table.ScrollContainer minWidth={500}>
        <Table highlightOnHover verticalSpacing="sm" layout="fixed">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Space")}</Table.Th>
              <Table.Th>{t("Members")}</Table.Th>
              {showArchived && <Table.Th>{t("Status")}</Table.Th>}
              {showArchived && <Table.Th aria-label={t("Action")} />}
            </Table.Tr>
          </Table.Thead>

          <Table.Tbody>
            {data?.items.length > 0 ? (
              data?.items.map((space, index) => (
                <Table.Tr
                  key={index}
                  className={rowClasses.row}
                  role="button"
                  tabIndex={0}
                  aria-label={t("Open settings for {{name}}", {
                    name: space.name,
                  })}
                  onClick={() => handleClick(space.slug)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleClick(space.slug);
                    }
                  }}
                >
                  <Table.Td>
                    <Group gap="sm" wrap="nowrap">
                      <SpaceAvatar
                        color="initials"
                        logo={space.logo}
                        variant="filled"
                        name={space.name}
                      />
                      <div style={{ minWidth: 0, overflow: "hidden" }}>
                        <AutoTooltipText fz="sm" fw={500} lineClamp={1}>
                          {space.name}
                        </AutoTooltipText>
                        <Text fz="xs" c="dimmed" lineClamp={2}>
                          {space.description}
                        </Text>
                      </div>
                    </Group>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" style={{ whiteSpace: "nowrap" }}>
                      {formatMemberCount(space.memberCount, t)}
                    </Text>
                  </Table.Td>
                  {showArchived && (
                    <Table.Td>
                      <Badge variant="light">{t("Archived")}</Badge>
                    </Table.Td>
                  )}
                  {showArchived && (
                    <Table.Td>
                      <Button
                        variant="subtle"
                        size="xs"
                        onClick={(event) => {
                          event.stopPropagation();
                          restoreMutation.mutate({
                            id: space.id,
                            slug: space.slug,
                          });
                        }}
                        loading={restoreMutation.isPending}
                      >
                        {t("Restore")}
                      </Button>
                    </Table.Td>
                  )}
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={showArchived ? 4 : 2} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {data?.items.length > 0 && (
        <Paginate
          hasPrevPage={data?.meta?.hasPrevPage}
          hasNextPage={data?.meta?.hasNextPage}
          onNext={() => goNext(data?.meta?.nextCursor)}
          onPrev={goPrev}
        />
      )}
    </>
  );
}
