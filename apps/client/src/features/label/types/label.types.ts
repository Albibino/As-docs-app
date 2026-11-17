import { QueryParams } from "@/lib/types.ts";

export type LabelColorKey =
  | "slate"
  | "blue"
  | "cyan"
  | "teal"
  | "green"
  | "lime"
  | "yellow"
  | "amber"
  | "orange"
  | "red"
  | "rose"
  | "pink"
  | "fuchsia"
  | "purple"
  | "violet"
  | "indigo";

export interface ILabelScope {
  workspaceId: string;
  spaceId: string | null;
}

export interface ILabelTreeSummary {
  id: string;
  name: string;
  slug: string;
  color: LabelColorKey | null;
  position: number;
}

export interface ILabelTree extends ILabelScope {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: LabelColorKey | null;
  position: number;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  nodes?: ILabelNode[];
}

export type LabelNodeKind = "group" | "label";

export interface ILabel extends ILabelScope {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: LabelColorKey | null;
  position: number;
  kind: LabelNodeKind;
  parentId: string | null;
  treeId: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
  tree?: ILabelTreeSummary | null;
  path?: string;
}

export interface ILabelInfoLabel extends ILabel {
  targetType: "label";
  tree: ILabelTreeSummary | null;
  ancestors: ILabelNode[];
}

export interface ILabelInfoTree extends ILabelTree {
  targetType: "tree";
  ancestors: [];
}

export type ILabelInfo = ILabelInfoLabel | ILabelInfoTree;

export interface ILabelNode extends ILabel {
  kind: LabelNodeKind;
  treeId: string;
  parentId: string | null;
}

export interface IAvailableTaxonomyTree extends ILabelTree {
  nodes: ILabelNode[];
}

export interface IAvailableLabels {
  trees: IAvailableTaxonomyTree[];
  freeLabels: ILabel[];
}

export interface IPageTaxonomyPath {
  tree: ILabelTreeSummary;
  selectedNodeId: string | null;
  nodes: ILabelNode[];
}

export interface IPageTaxonomy {
  paths: IPageTaxonomyPath[];
  freeLabels: ILabel[];
}

export interface IPageLabelDisplay {
  id: string;
  name: string;
  color: LabelColorKey | null;
  treeId: string | null;
  tree?: ILabelTreeSummary | null;
  path: string;
  taxonomy: boolean;
  /** Zero-based node depth used to derive the taxonomy display color. */
  hierarchyDepth?: number;
}

export interface IApplyLabelResult {
  label: ILabel;
  replaced?: ILabel;
}

export interface IPageLabelParams {
  pageId: string;
  labelId: string;
}

export interface ISelectTaxonomyParams {
  pageId: string;
  treeId: string;
  nodeId: string | null;
}

export interface IRemoveTaxonomyParams {
  pageId: string;
  treeId: string;
}

export interface ICreatePageLabelParams {
  pageId: string;
  name: string;
}

export interface IListLabelsParams {
  spaceId: string;
}

export interface IListOwnedLabelsParams {
  spaceId?: string;
}

export interface ICreateLabelTreeParams {
  name: string;
  description?: string;
  color?: LabelColorKey;
  spaceId?: string;
}

export interface IUpdateLabelTreeParams {
  treeId: string;
  name?: string;
  description?: string | null;
  color?: LabelColorKey | null;
  position?: number;
}

export interface ICreateLabelNodeParams {
  treeId: string;
  parentId?: string | null;
  kind: LabelNodeKind;
  name: string;
  description?: string;
  color?: LabelColorKey;
  position?: number;
}

export interface IUpdateLabelNodeParams {
  nodeId: string;
  name?: string;
  description?: string | null;
  color?: LabelColorKey | null;
}

export interface IMoveLabelNodeParams {
  nodeId: string;
  parentId?: string | null;
  position: number;
}

export interface ICreateLabelParams {
  name: string;
  description?: string;
  color?: LabelColorKey;
  spaceId?: string;
}

export interface IUpdateLabelParams {
  labelId: string;
  name?: string;
  description?: string | null;
  color?: LabelColorKey | null;
  position?: number;
}

export interface ILabelUsage {
  pageCount: number;
}

export interface ITreeImpact {
  nodeCount: number;
  pageCount: number;
}

export interface INodeImpact {
  nodeCount?: number;
  pageCount: number;
}

export interface IMoveLabelNodeImpact {
  currentPath: string[];
  nextPath: string[];
  pageCount: number;
}

export interface ILabelPageItem {
  id: string;
  slugId: string;
  title: string | null;
  icon: string | null;
  spaceId: string;
  createdAt: string;
  updatedAt: string;
  space: {
    id: string;
    name: string;
    slug: string;
    logo: string | null;
  } | null;
  creator: { id: string; name: string; avatarUrl: string | null } | null;
  labels: { id: string; name: string; color: LabelColorKey | null }[];
}

export interface IFindPagesByLabelParams extends QueryParams {
  labelId: string;
  spaceId?: string;
}

export interface ILabelSnapshot {
  id: string;
  name: string;
  color: LabelColorKey | null;
  treeId: string | null;
  parentId: string | null;
  kind: LabelNodeKind;
  treeName: string | null;
}

export type LabelHistoryEvent =
  | "page.label_added"
  | "page.label_removed"
  | "page.label_replaced";

export interface ILabelHistoryEntry {
  id: string;
  event: LabelHistoryEvent;
  changes: {
    before?: { label?: ILabelSnapshot; path?: string[] };
    after?: { label?: ILabelSnapshot; path?: string[] };
  } | null;
  createdAt: string;
  actor: { id: string; name: string; avatarUrl: string | null } | null;
}
