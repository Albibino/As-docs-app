import {
  CSSProperties,
  KeyboardEvent,
  useCallback,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import clsx from "clsx";
import { IconCheck, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { useComputedColorScheme } from "@mantine/core";
import {
  IAvailableTaxonomyTree,
  LabelColorKey,
  IPageLabelDisplay,
  ILabelNode,
} from "@/features/label/types/label.types.ts";
import { useAvailableLabelsQuery } from "@/features/label/queries/label-query.ts";
import {
  getLabelColor,
  getLabelHierarchyColor,
  resolveLabelTreeColor,
} from "@/features/label/utils/label-colors.ts";
import { normalizeLabelName } from "@/features/label/utils/normalize-label.ts";
import classes from "@/features/label/label.module.css";
import { LabelPathTooltip } from "@/features/label/components/label-path-tooltip.tsx";
import {
  calculateLabelPickerWidth,
  LABEL_PICKER_MIN_WIDTH,
} from "@/features/label/utils/label-picker-layout.ts";

type LabelPickerProps = {
  spaceId: string;
  applied: IPageLabelDisplay[];
  enabled: boolean;
  canCreate: boolean;
  onApply: (labelId: string) => void;
  onSelect: (treeId: string, nodeId: string | null) => void;
  onRemove: (label: IPageLabelDisplay) => void;
  onCreate: (name: string) => void;
  onClose: () => void;
  focusTreeId?: string | null;
};

const MAX_LABEL_NAME_LENGTH = 60;

type Option = {
  id: string;
  name: string;
  path: string;
  color: LabelColorKey | null;
  kind: string;
  treeId?: string;
  labelId?: string;
  depth?: number;
  colorDepth?: number;
};

type Section = {
  tree?: IAvailableTaxonomyTree;
  options: Option[];
  free: boolean;
};

function flattenTree(tree: IAvailableTaxonomyTree, needle: string): Option[] {
  const nodes = tree.nodes ?? [];
  const treeColor = resolveLabelTreeColor(tree.color);
  const byParent = new Map<string | null, ILabelNode[]>();
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const node of nodes) {
    const list = byParent.get(node.parentId) ?? [];
    list.push(node);
    byParent.set(node.parentId, list);
  }

  const options: Option[] = [];
  if (!needle || tree.name.toLowerCase().includes(needle)) {
    options.push({
      id: `tree:${tree.id}`,
      treeId: tree.id,
      name: tree.name,
      path: tree.name,
      color: treeColor,
      kind: "group",
      depth: 0,
      colorDepth: 0,
    });
  }
  const visit = (
    parentId: string | null,
    ancestors: string[],
    depth: number,
  ) => {
    for (const node of byParent.get(parentId) ?? []) {
      const path = [tree.name, ...ancestors, node.name].join(" / ");
      if (!needle || path.toLowerCase().includes(needle)) {
        options.push({
          id: node.id,
          labelId: node.id,
          treeId: tree.id,
          name: node.name,
          path,
          color: treeColor,
          kind: node.kind,
          depth,
          colorDepth: Math.max(depth - 1, 0),
        });
      }
      visit(node.id, [...ancestors, node.name], depth + 1);
    }
  };

  // A malformed legacy tree should not make the picker recurse forever.
  const roots = byParent.get(null) ?? [];
  if (roots.length) visit(null, [], 1);
  else {
    for (const node of nodes) {
      if (!byId.has(node.parentId ?? "")) {
        const path = [tree.name, node.name].join(" / ");
        if (!needle || path.toLowerCase().includes(needle)) {
          options.push({
            id: node.id,
            labelId: node.id,
            treeId: tree.id,
            name: node.name,
            path,
            color: treeColor,
            kind: node.kind,
            depth: 1,
            colorDepth: 0,
          });
        }
      }
    }
  }
  return options;
}

export function LabelPicker({
  spaceId,
  applied,
  enabled,
  canCreate,
  onApply,
  onSelect,
  onRemove,
  onCreate,
  onClose,
  focusTreeId,
}: LabelPickerProps) {
  const { t } = useTranslation();
  const scheme = useComputedColorScheme("light");
  const [query, setQuery] = useState("");
  const [hover, setHover] = useState(0);
  const [keyboardActiveIndex, setKeyboardActiveIndex] = useState<number | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pickerWidth, setPickerWidth] = useState(LABEL_PICKER_MIN_WIDTH);
  const { data } = useAvailableLabelsQuery(spaceId, enabled);
  const appliedByTree = useMemo(
    () =>
      new Map(
        applied
          .filter((label) => label.taxonomy && label.treeId)
          .map((label) => [label.treeId!, label]),
      ),
    [applied],
  );
  const appliedFreeIds = useMemo(
    () =>
      new Set(
        applied.filter((label) => !label.taxonomy).map((label) => label.id),
      ),
    [applied],
  );
  const needle = query.trim().toLowerCase();

  const sections = useMemo<Section[]>(() => {
    if (!data) return [];
    const trees = data.trees
      .filter((tree) => !focusTreeId || tree.id === focusTreeId)
      .map((tree) => ({
        tree,
        options: flattenTree(tree, needle),
        free: false,
      }));
    if (focusTreeId) return trees;
    const freeLabels = data.freeLabels
      .filter((label) => !needle || label.name.toLowerCase().includes(needle))
      .map((label) => ({
        id: label.id,
        labelId: label.id,
        name: label.name,
        path: label.name,
        color: label.color,
        kind: "label",
      }));
    return freeLabels.length
      ? [...trees, { options: freeLabels, free: true }]
      : trees;
  }, [data, focusTreeId, needle]);

  const flat = sections.flatMap((section) => section.options);
  const normalized = normalizeLabelName(query);
  const showCreate =
    canCreate &&
    !focusTreeId &&
    normalized.length > 0 &&
    normalized.length <= MAX_LABEL_NAME_LENGTH &&
    !flat.some((option) => option.path.toLowerCase() === normalized);
  const total = flat.length + (showCreate ? 1 : 0);

  const sectionTitles = useMemo(
    () =>
      sections.map((section) => ({
        title: section.tree?.name ?? t("Other"),
        hint: section.tree ? t("one active path") : undefined,
      })),
    [sections, t],
  );
  const auxiliaryTexts = useMemo(
    () =>
      [
        canCreate ? t("Search or create…") : t("Search…"),
        showCreate ? `${t("Create")} "${query.trim()}"` : "",
        !total ? (needle ? t("No matches") : t("No labels yet")) : "",
      ].filter(Boolean),
    [canCreate, needle, query, showCreate, t, total],
  );
  const measurePickerText = useCallback((text: string) => {
    const reference = popoverRef.current;
    if (!reference || typeof document === "undefined") {
      return text.length * 7;
    }

    const computed = window.getComputedStyle(reference);
    const measure = document.createElement("span");
    measure.className = classes.popoverMeasure;
    measure.textContent = text;
    measure.style.font = computed.font;
    measure.style.letterSpacing = computed.letterSpacing;
    document.body.appendChild(measure);
    const width = measure.getBoundingClientRect().width;
    measure.remove();

    return width || text.length * 7;
  }, []);
  const recalculatePickerWidth = useCallback(() => {
    const nextWidth = calculateLabelPickerWidth({
      options: flat,
      sectionTitles,
      auxiliaryTexts,
      measureText: measurePickerText,
    });

    setPickerWidth((current) => (current === nextWidth ? current : nextWidth));
  }, [auxiliaryTexts, flat, measurePickerText, sectionTitles]);

  useLayoutEffect(() => {
    recalculatePickerWidth();

    const reference = popoverRef.current;
    if (!reference) return;

    const onResize = () => recalculatePickerWidth();
    window.addEventListener("resize", onResize);
    const observer =
      typeof ResizeObserver === "undefined"
        ? undefined
        : new ResizeObserver(onResize);
    observer?.observe(reference);

    let cancelled = false;
    const fontsReady = document.fonts?.ready;
    fontsReady?.then(() => {
      if (!cancelled) recalculatePickerWidth();
    });

    return () => {
      cancelled = true;
      window.removeEventListener("resize", onResize);
      observer?.disconnect();
    };
  }, [recalculatePickerWidth]);

  const listboxId = useId();
  const optionId = (index: number) => `${listboxId}-option-${index}`;

  const toggle = (option: Option) => {
    if (option.treeId) {
      const current = appliedByTree.get(option.treeId);
      const selectedId = option.labelId ?? `tree:${option.treeId}`;
      if (current?.id === selectedId) onRemove(current);
      else onSelect(option.treeId, option.labelId ?? null);
    } else if (option.labelId) {
      if (appliedFreeIds.has(option.labelId)) {
        onRemove(applied.find((label) => label.id === option.labelId)!);
      } else {
        onApply(option.labelId);
      }
    }
    setQuery("");
    setHover(0);
    setKeyboardActiveIndex(null);
    inputRef.current?.focus();
  };

  const select = (index: number) => {
    if (index < flat.length) toggle(flat[index]);
    else if (showCreate) {
      onCreate(query.trim());
      setQuery("");
      setHover(0);
      setKeyboardActiveIndex(null);
      inputRef.current?.focus();
    }
  };

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHover((value) => {
        const next = Math.min(Math.max(total - 1, 0), value + 1);
        setKeyboardActiveIndex(next);
        return next;
      });
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHover((value) => {
        const next = Math.max(0, value - 1);
        setKeyboardActiveIndex(next);
        return next;
      });
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (total) select(hover);
    } else if (event.key === "Escape") {
      event.preventDefault();
      setKeyboardActiveIndex(null);
      onClose();
    }
  };

  let flatIndex = 0;
  return (
    <div
      ref={popoverRef}
      className={classes.popover}
      style={
        {
          "--label-picker-width": `${pickerWidth}px`,
        } as CSSProperties
      }
    >
      <div className={classes.popoverSearch}>
        <input
          ref={inputRef}
          type="text"
          autoFocus
          maxLength={MAX_LABEL_NAME_LENGTH}
          placeholder={canCreate ? t("Search or create…") : t("Search…")}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setHover(0);
            setKeyboardActiveIndex(null);
          }}
          onKeyDown={onKey}
          role="combobox"
          aria-label={t("Search labels")}
          aria-expanded="true"
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={total ? optionId(hover) : undefined}
        />
      </div>
      <div
        id={listboxId}
        className={classes.popoverList}
        role="listbox"
        aria-label={t("Labels")}
      >
        {!total && (
          <div className={classes.popoverEmpty}>
            {needle ? t("No matches") : t("No labels yet")}
          </div>
        )}
        {sections.map((section) => (
          <div
            key={section.tree?.id ?? "free"}
            className={classes.popoverSection}
          >
            <div className={classes.popoverSectionTitle}>
              <span>{section.tree?.name ?? t("Other")}</span>
              {section.tree && (
                <span className={classes.popoverSectionHint}>
                  {t("one active path")}
                </span>
              )}
            </div>
            {section.options.map((option) => {
              const index = flatIndex++;
              const current = option.treeId
                ? appliedByTree.get(option.treeId)
                : undefined;
              const isApplied = option.treeId
                ? current?.id === option.id
                : appliedFreeIds.has(option.id);
              const color = option.treeId
                ? getLabelHierarchyColor(
                    section.tree?.name ?? option.name,
                    section.tree?.color ?? null,
                    option.colorDepth ?? 0,
                    scheme,
                  )
                : getLabelColor(option.name, scheme, option.color);
              return (
                <button
                  key={option.id}
                  type="button"
                  className={clsx(
                    classes.popoverItem,
                    hover === index && classes.popoverItemHover,
                  )}
                  style={{
                    paddingLeft: option.depth
                      ? `${12 + option.depth * 14}px`
                      : undefined,
                  }}
                  onMouseEnter={() => {
                    setHover(index);
                    setKeyboardActiveIndex(null);
                  }}
                  onFocus={() => setKeyboardActiveIndex(index)}
                  onBlur={() => setKeyboardActiveIndex(null)}
                  onClick={() => toggle(option)}
                  id={optionId(index)}
                  role="option"
                  aria-selected={isApplied}
                  aria-label={option.path}
                >
                  <span
                    className={classes.popoverItemDot}
                    style={{ background: color.dot }}
                  />
                  <LabelPathTooltip
                    name={option.name}
                    path={option.path}
                    opened={keyboardActiveIndex === index}
                    className={classes.popoverItemName}
                  >
                    {option.name}
                  </LabelPathTooltip>
                  <span className={classes.popoverItemCheck}>
                    {isApplied && <IconCheck size={14} stroke={2} />}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
        {showCreate && (
          <button
            type="button"
            className={clsx(
              classes.popoverItem,
              hover === flat.length && classes.popoverItemHover,
            )}
            onMouseEnter={() => {
              setHover(flat.length);
              setKeyboardActiveIndex(null);
            }}
            onClick={() => select(flat.length)}
            id={optionId(flat.length)}
            role="option"
            aria-selected="false"
          >
            <span className={classes.popoverCreatePlus}>
              <IconPlus size={12} stroke={2} />
            </span>
            <span className={classes.popoverItemName}>
              {t("Create")} <b>"{query.trim()}"</b>
            </span>
          </button>
        )}
      </div>
    </div>
  );
}
