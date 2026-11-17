import { useState } from "react";
import clsx from "clsx";
import { Popover, useComputedColorScheme } from "@mantine/core";
import { IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { LabelChip } from "@/features/label/components/label-chip.tsx";
import { LabelPicker } from "@/features/label/components/label-picker.tsx";
import { usePageLabels } from "@/features/label/hooks/use-page-labels.ts";
import { getLabelHierarchyColor } from "@/features/label/utils/label-colors.ts";
import classes from "@/features/label/label.module.css";

type PageLabelsInlineProps = {
  pageId: string;
  spaceId: string;
  canEdit: boolean;
};

/** Beyond this the byline stops being a line. The rest hide behind "+N". */
const MAX_VISIBLE = 4;

export function PageLabelsInline({
  pageId,
  spaceId,
  canEdit,
}: PageLabelsInlineProps) {
  const { t } = useTranslation();
  const scheme = useComputedColorScheme("light");
  const { labels, apply, select, create, remove } = usePageLabels(pageId);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [focusTreeId, setFocusTreeId] = useState<string | null>(null);

  const visible = labels.slice(0, MAX_VISIBLE);
  const overflow = labels.slice(MAX_VISIBLE);

  const getHierarchyColor = (label: (typeof labels)[number]) => {
    if (!label.taxonomy || !label.tree) return undefined;

    return getLabelHierarchyColor(
      label.tree.name,
      label.tree.color,
      label.hierarchyDepth ?? 0,
      scheme,
    );
  };

  if (labels.length === 0 && !canEdit) {
    return null;
  }

  const openPickerFor = (treeId: string | null) => {
    setFocusTreeId(treeId);
    setPickerOpen(true);
  };

  const picker = (
    <LabelPicker
      spaceId={spaceId}
      applied={labels}
      enabled={pickerOpen}
      canCreate={!focusTreeId}
      onApply={apply}
      onSelect={select}
      onCreate={create}
      onRemove={remove}
      onClose={() => setPickerOpen(false)}
      focusTreeId={focusTreeId}
    />
  );

  return (
    <div className={classes.bylineLabels}>
      {visible.map((label) => (
        <LabelChip
          key={label.id}
          label={label}
          asLink
          compactTaxonomy
          variant={label.taxonomy ? "solid" : undefined}
          colorOverride={getHierarchyColor(label)}
          onRemove={canEdit ? () => remove(label) : undefined}
        />
      ))}

      {overflow.length > 0 && (
        <Popover
          opened={overflowOpen}
          onChange={setOverflowOpen}
          position="bottom-start"
          shadow="lg"
          withinPortal
          offset={6}
        >
          <Popover.Target>
            <button
              type="button"
              className={clsx(classes.chipMore, classes.moreChip)}
              onClick={() => setOverflowOpen((v) => !v)}
              aria-label={t("Show {{count}} more labels", {
                count: overflow.length,
              })}
            >
              +{overflow.length}
            </button>
          </Popover.Target>
          <Popover.Dropdown p="xs">
            <div className={classes.labelsWrap}>
              {overflow.map((label) => (
                <LabelChip
                  key={label.id}
                  label={label}
                  asLink
                  compactTaxonomy
                  variant={label.taxonomy ? "solid" : undefined}
                  colorOverride={getHierarchyColor(label)}
                  onRemove={canEdit ? () => remove(label) : undefined}
                />
              ))}
            </div>
          </Popover.Dropdown>
        </Popover>
      )}

      {canEdit && (
        <Popover
          opened={pickerOpen}
          onChange={(opened) => {
            setPickerOpen(opened);
            if (!opened) setFocusTreeId(null);
          }}
          position="bottom-start"
          shadow="lg"
          withinPortal
          offset={6}
        >
          <Popover.Target>
            <button
              type="button"
              className={clsx(classes.addBtn, pickerOpen && classes.addBtnOpen)}
              onClick={() => openPickerFor(null)}
              aria-label={t("Add label")}
            >
              <IconPlus size={12} stroke={2} />
              {labels.length === 0 && <span>{t("Add label")}</span>}
            </button>
          </Popover.Target>
          <Popover.Dropdown p={0} className={classes.popoverDropdown}>
            {picker}
          </Popover.Dropdown>
        </Popover>
      )}
    </div>
  );
}
