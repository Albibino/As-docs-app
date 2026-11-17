import { useState } from "react";
import { Link } from "react-router-dom";
import { useComputedColorScheme } from "@mantine/core";
import { IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  ILabel,
  IPageLabelDisplay,
} from "@/features/label/types/label.types.ts";
import {
  getLabelChipBackground,
  getLabelColor,
  LabelColor,
} from "@/features/label/utils/label-colors.ts";
import { LabelPathTooltip } from "@/features/label/components/label-path-tooltip.tsx";
import classes from "@/features/label/label.module.css";

type LabelChipProps = {
  label: IPageLabelDisplay | ILabel;
  onRemove?: () => void;
  asLink?: boolean;
  /** Shows a taxonomy chip as "tree : selected node" with its full path in a tooltip. */
  compactTaxonomy?: boolean;
  /** Renders a compact dot or a soft solid-color chip. */
  variant?: "chip" | "dot" | "solid";
  colorOverride?: LabelColor;
};

function getTaxonomyNodeSegments(
  path: string,
  treeName: string,
  labelName: string,
) {
  const segments = path
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);
  const nodeSegments = segments[0] === treeName ? segments.slice(1) : segments;

  if (nodeSegments.length === 0) return [labelName];
  if (nodeSegments.at(-1) !== labelName) return [...nodeSegments, labelName];
  return nodeSegments;
}

export function formatTaxonomyPath(
  path: string,
  treeName: string,
  labelName: string,
) {
  const nodeSegments = getTaxonomyNodeSegments(path, treeName, labelName);
  const parentSeparator = nodeSegments.length > 1 ? "/ " : "";

  return `${treeName} : ${parentSeparator}${nodeSegments.join(" / ")}`;
}

export function LabelChip({
  label,
  onRemove,
  asLink,
  compactTaxonomy,
  variant = "chip",
  colorOverride,
}: LabelChipProps) {
  const { t } = useTranslation();
  const [linkFocused, setLinkFocused] = useState(false);
  const scheme = useComputedColorScheme("light");
  const c =
    colorOverride ??
    getLabelColor(label.name, scheme, label.color ?? label.tree?.color ?? null);
  const isDotVariant = variant === "dot";
  const isSolidVariant = variant === "solid";

  const isTaxonomyLabel = "taxonomy" in label && label.taxonomy;
  const isTreeOnly = isTaxonomyLabel && label.id.startsWith("tree:");
  const treeName = label.tree?.name;
  const isCompactTaxonomy = Boolean(
    compactTaxonomy && isTaxonomyLabel && !isTreeOnly && treeName,
  );
  const path = "path" in label && label.path ? label.path : label.name;
  const nodeSegments =
    isCompactTaxonomy && treeName
      ? getTaxonomyNodeSegments(path, treeName, label.name)
      : [];
  const hasParents = nodeSegments.length > 1;
  const compactText =
    isCompactTaxonomy && treeName
      ? `${treeName} : ${hasParents ? "/ " : ""}${label.name}`
      : label.name;
  const fullPath =
    isCompactTaxonomy && treeName
      ? formatTaxonomyPath(path, treeName, label.name)
      : path;
  const accessiblePath = isCompactTaxonomy ? fullPath : undefined;

  const nameContent =
    isCompactTaxonomy && hasParents ? (
      <LabelPathTooltip
        name={compactText}
        path={fullPath}
        opened={linkFocused}
        ariaLabel={accessiblePath}
        className={classes.chipName}
      >
        {compactText}
      </LabelPathTooltip>
    ) : (
      <span className={classes.chipName}>{compactText}</span>
    );

  const nameNode =
    !asLink || isTreeOnly ? (
      nameContent
    ) : (
      <Link
        to={`/labels/${label.id}`}
        className={classes.chipLink}
        aria-label={accessiblePath}
        onFocus={() => setLinkFocused(true)}
        onBlur={() => setLinkFocused(false)}
        onClick={(e) => e.stopPropagation()}
      >
        {nameContent}
      </Link>
    );

  return (
    <span
      className={isDotVariant ? classes.dotChip : classes.chip}
      data-label-appearance={variant}
      style={
        isDotVariant
          ? undefined
          : {
              background: isSolidVariant ? getLabelChipBackground(c.dot) : c.bg,
              color: c.fg,
            }
      }
    >
      {isDotVariant && (
        <span
          className={classes.dotChipMarker}
          data-label-dot="true"
          aria-hidden="true"
          style={{ background: c.dot }}
        />
      )}
      {nameNode}
      {onRemove && (
        <button
          type="button"
          className={classes.chipX}
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onRemove();
          }}
          aria-label={t("Remove label {{name}}", { name: label.name })}
        >
          <IconX size={12} stroke={2} />
        </button>
      )}
    </span>
  );
}
