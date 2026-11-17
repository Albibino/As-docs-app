import React, { useState, useEffect } from "react";
import { Button, getDefaultZIndex } from "@mantine/core";
import { IconChevronDown, IconBuilding } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useGetSpacesQuery } from "@/features/space/queries/space-query";
import { SpaceFilterMenu } from "@/features/space/components/space-filter-menu";
import { SearchLabelFilter } from "./search-label-filter.tsx";
import classes from "./search-spotlight-filters.module.css";

interface SearchSpotlightFiltersProps {
  onFiltersChange?: (filters: any) => void;
  spaceId?: string;
}

export function SearchSpotlightFilters({
  onFiltersChange,
  spaceId,
}: SearchSpotlightFiltersProps) {
  const { t } = useTranslation();
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(
    spaceId || null,
  );
  const [labelIds, setLabelIds] = useState<string[]>([]);
  const [taxonomyFilters, setTaxonomyFilters] = useState<
    Array<{ treeId: string; nodeIds: string[] }>
  >([]);

  const { data: spacesData } = useGetSpacesQuery({ limit: 100 });
  const selectedSpaceData = selectedSpaceId
    ? spacesData?.items.find((space) => space.id === selectedSpaceId)
    : null;

  useEffect(() => {
    if (onFiltersChange) {
      onFiltersChange({
        spaceId: selectedSpaceId,
        labelIds,
        taxonomyFilters,
      });
    }
  }, []);

  const handleSpaceSelect = (spaceId: string | null) => {
    setSelectedSpaceId(spaceId);
    // A space has its own visible taxonomy. Clear selections from the previous
    // scope so hidden label ids cannot keep filtering the result set.
    setLabelIds([]);
    setTaxonomyFilters([]);

    if (onFiltersChange) {
      onFiltersChange({
        spaceId,
        labelIds: [],
        taxonomyFilters: [],
      });
    }
  };

  return (
    <div className={classes.filtersContainer}>
      <SpaceFilterMenu
        value={selectedSpaceId}
        onChange={handleSpaceSelect}
        position="bottom-start"
        width={250}
        zIndex={getDefaultZIndex("max")}
      >
        <Button
          variant="subtle"
          color="gray"
          size="sm"
          rightSection={<IconChevronDown size={14} />}
          leftSection={<IconBuilding size={16} />}
          className={classes.filterButton}
          fw={500}
        >
          {selectedSpaceId
            ? `${t("Space")}: ${selectedSpaceData?.name || t("Unknown")}`
            : `${t("Space")}: ${t("All spaces")}`}
        </Button>
      </SpaceFilterMenu>

      <SearchLabelFilter
        value={labelIds}
        spaceId={selectedSpaceId}
        taxonomyFilters={taxonomyFilters}
        onChange={(ids, nextTaxonomyFilters) => {
          setLabelIds(ids);
          setTaxonomyFilters(nextTaxonomyFilters);
          onFiltersChange?.({
            spaceId: selectedSpaceId,
            labelIds: ids,
            taxonomyFilters: nextTaxonomyFilters,
          });
        }}
      />
    </div>
  );
}
