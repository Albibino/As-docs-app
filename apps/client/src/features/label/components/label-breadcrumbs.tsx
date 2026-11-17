import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { ILabelInfo } from "@/features/label/types/label.types.ts";
import classes from "@/features/label/label.module.css";

type LabelBreadcrumbsProps = {
  label: ILabelInfo;
};

export function LabelBreadcrumbs({ label }: LabelBreadcrumbsProps) {
  const { t } = useTranslation();
  const ancestors = label.ancestors ?? [];
  const isTreeTarget = label.targetType === "tree";

  return (
    <nav aria-label={t("Label path")} className={classes.labelBreadcrumb}>
      <span>{t("Labels")}</span>
      {!isTreeTarget && label.tree && (
        <>
          <span className={classes.labelBreadcrumbSeparator} aria-hidden="true">
            /
          </span>
          <Link
            to={`/labels/${label.tree.id}`}
            className={classes.labelBreadcrumbLink}
            title={label.tree.name}
          >
            {label.tree.name}
          </Link>
        </>
      )}
      {!isTreeTarget &&
        ancestors.map((ancestor) => (
          <span className={classes.labelBreadcrumbSegment} key={ancestor.id}>
            <span
              className={classes.labelBreadcrumbSeparator}
              aria-hidden="true"
            >
              /
            </span>
            <Link
              to={`/labels/${ancestor.id}`}
              className={classes.labelBreadcrumbLink}
              title={ancestor.name}
            >
              {ancestor.name}
            </Link>
          </span>
        ))}
      <span className={classes.labelBreadcrumbSegment}>
        <span className={classes.labelBreadcrumbSeparator} aria-hidden="true">
          /
        </span>
        <span
          className={classes.labelBreadcrumbCurrent}
          aria-current="page"
          title={label.name}
        >
          {label.name}
        </span>
      </span>
    </nav>
  );
}
