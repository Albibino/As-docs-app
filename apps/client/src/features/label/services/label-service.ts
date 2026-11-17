import api from "@/lib/api-client";
import { IPagination } from "@/lib/types.ts";
import {
  IAvailableLabels,
  ICreateLabelNodeParams,
  ICreateLabelParams,
  ICreateLabelTreeParams,
  ICreatePageLabelParams,
  IFindPagesByLabelParams,
  ILabel,
  ILabelInfo,
  ILabelHistoryEntry,
  ILabelNode,
  ILabelPageItem,
  ILabelTree,
  ILabelUsage,
  IListLabelsParams,
  IListOwnedLabelsParams,
  IMoveLabelNodeImpact,
  IMoveLabelNodeParams,
  INodeImpact,
  IPageTaxonomy,
  IPageLabelParams,
  IRemoveTaxonomyParams,
  ISelectTaxonomyParams,
  ITreeImpact,
  IUpdateLabelNodeParams,
  IUpdateLabelParams,
  IUpdateLabelTreeParams,
} from "@/features/label/types/label.types.ts";

/* ---------- page ---------- */

export async function getPageLabels(pageId: string): Promise<IPageTaxonomy> {
  const req = await api.post<IPageTaxonomy>("/pages/taxonomy", { pageId });
  return req.data;
}

export async function applyPageLabel(data: IPageLabelParams): Promise<ILabel> {
  const req = await api.post<{ label: ILabel }>("/pages/labels/apply", data);
  return req.data.label;
}

export async function selectPageTaxonomy(
  data: ISelectTaxonomyParams,
): Promise<void> {
  await api.post("/pages/taxonomy/select", data);
}

export async function removePageTaxonomy(
  data: IRemoveTaxonomyParams,
): Promise<void> {
  await api.post("/pages/taxonomy/remove", data);
}

export async function createPageLabel(
  data: ICreatePageLabelParams,
): Promise<ILabel> {
  const req = await api.post<{ label: ILabel }>("/pages/labels/create", data);
  return req.data.label;
}

export async function removePageLabel(data: IPageLabelParams): Promise<void> {
  await api.post("/pages/labels/remove", data);
}

export async function getPageLabelHistory(
  pageId: string,
  limit = 20,
): Promise<IPagination<ILabelHistoryEntry>> {
  const req = await api.post<IPagination<ILabelHistoryEntry>>(
    "/pages/taxonomy/history",
    { pageId, limit },
  );
  return req.data;
}

/* ---------- picker ---------- */

export async function getAvailableLabels(
  params: IListLabelsParams,
): Promise<IAvailableLabels> {
  const req = await api.post<IAvailableLabels>("/labels", params);
  return req.data;
}

export async function getSearchableLabels(): Promise<IAvailableLabels> {
  const req = await api.post<IAvailableLabels>("/labels/searchable", {});
  return req.data;
}

/* ---------- admin ---------- */

export async function getOwnedLabels(
  params: IListOwnedLabelsParams,
): Promise<IAvailableLabels> {
  const req = await api.post<IAvailableLabels>("/label-trees/manage", params);
  return req.data;
}

export async function createLabelTree(
  data: ICreateLabelTreeParams,
): Promise<ILabelTree> {
  const req = await api.post<ILabelTree>("/label-trees/create", data);
  return req.data;
}

export async function updateLabelTree(
  data: IUpdateLabelTreeParams,
): Promise<ILabelTree> {
  const req = await api.post<ILabelTree>("/label-trees/update", data);
  return req.data;
}

export async function deleteLabelTree(treeId: string): Promise<void> {
  await api.post("/label-trees/delete", { treeId });
}

export async function getLabelTreeImpact(treeId: string): Promise<ITreeImpact> {
  const req = await api.post<ITreeImpact>("/label-trees/impact", { treeId });
  return req.data;
}

export async function createLabelNode(
  data: ICreateLabelNodeParams,
): Promise<ILabelNode> {
  const req = await api.post<{ node: ILabelNode }>("/label-nodes/create", data);
  return req.data.node;
}

export async function updateLabelNode(
  data: IUpdateLabelNodeParams,
): Promise<ILabelNode> {
  const req = await api.post<ILabelNode>("/label-nodes/update", data);
  return req.data;
}

export async function moveLabelNode(
  data: IMoveLabelNodeParams,
): Promise<ILabelNode> {
  const req = await api.post<ILabelNode>("/label-nodes/move", data);
  return req.data;
}

export async function getMoveLabelNodeImpact(
  data: IMoveLabelNodeParams,
): Promise<IMoveLabelNodeImpact> {
  const req = await api.post<IMoveLabelNodeImpact>(
    "/label-nodes/move-impact",
    data,
  );
  return req.data;
}

export async function deleteLabelNode(nodeId: string): Promise<void> {
  await api.post("/label-nodes/delete", { nodeId });
}

export async function getLabelNodeImpact(nodeId: string): Promise<INodeImpact> {
  const req = await api.post<INodeImpact>("/label-nodes/delete-impact", {
    nodeId,
  });
  return req.data;
}

export async function createLabel(data: ICreateLabelParams): Promise<ILabel> {
  const req = await api.post<ILabel>("/labels/create", data);
  return req.data;
}

export async function updateLabel(data: IUpdateLabelParams): Promise<ILabel> {
  const req = await api.post<ILabel>("/labels/update", data);
  return req.data;
}

export async function deleteLabel(labelId: string): Promise<void> {
  await api.post("/labels/delete", { labelId });
}

export async function getLabelUsage(labelId: string): Promise<ILabelUsage> {
  const req = await api.post<ILabelUsage>("/labels/usage", { labelId });
  return req.data;
}

/* ---------- listing ---------- */

export async function getLabelInfo(labelId: string): Promise<ILabelInfo> {
  const req = await api.post<ILabelInfo>("/labels/info", { labelId });
  return req.data;
}

export async function findPagesByLabel(
  params: IFindPagesByLabelParams,
): Promise<IPagination<ILabelPageItem>> {
  const req = await api.post<IPagination<ILabelPageItem>>(
    "/labels/pages",
    params,
  );
  return req.data;
}
