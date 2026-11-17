import { useEffect, useMemo, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import {
  draggable,
  dropTargetForElements,
} from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import {
  attachClosestEdge,
  extractClosestEdge,
  type Edge,
} from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { triggerPostMoveFlash } from "@atlaskit/pragmatic-drag-and-drop-flourish/trigger-post-move-flash";
import * as liveRegion from "@atlaskit/pragmatic-drag-and-drop-live-region";
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Modal,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
  useComputedColorScheme,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import {
  IconChevronDown,
  IconChevronRight,
  IconGripVertical,
  IconPencil,
  IconPlus,
  IconTag,
  IconTrash,
} from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import {
  ILabel,
  ILabelNode,
  ILabelTree,
  LabelColorKey,
  LabelNodeKind,
} from "@/features/label/types/label.types.ts";
import {
  getLabelNodeImpact,
  getLabelUsage,
  getLabelTreeImpact,
  getMoveLabelNodeImpact,
} from "@/features/label/services/label-service.ts";
import {
  useAvailableLabelsQuery,
  useCreateLabelMutation,
  useCreateLabelNodeMutation,
  useCreateLabelTreeMutation,
  useDeleteLabelMutation,
  useDeleteLabelNodeMutation,
  useDeleteLabelTreeMutation,
  useOwnedLabelsQuery,
  useUpdateLabelMutation,
  useUpdateLabelNodeMutation,
  useUpdateLabelTreeMutation,
  useMoveLabelNodeMutation,
} from "@/features/label/queries/label-query.ts";
import { LabelChip } from "@/features/label/components/label-chip.tsx";
import {
  DEFAULT_LABEL_TREE_COLOR,
  getLabelHierarchyColor,
} from "@/features/label/utils/label-colors.ts";
import { LabelColorPicker } from "./label-color-picker.tsx";
import {
  canReorderLabelNodes,
  getSiblingDropPosition,
  type LabelDropEdge,
} from "./label-node-order.ts";
import classes from "@/features/label/label.module.css";

type LabelTaxonomyManagerProps = { spaceId?: string };

type TreeForm = {
  tree?: ILabelTree | null;
  name: string;
  description: string;
  color: LabelColorKey | null;
};

type NodeForm = {
  treeId: string;
  node?: ILabelNode | null;
  parentId: string | null;
  kind: LabelNodeKind;
  name: string;
  description: string;
  color: LabelColorKey | null;
};

type FreeForm = {
  label?: ILabel | null;
  name: string;
  description: string;
  color: LabelColorKey | null;
};

const LABEL_NODE_DRAG_TYPE = "label-node";

export function LabelTaxonomyManager({ spaceId }: LabelTaxonomyManagerProps) {
  const { t } = useTranslation();
  const { data, isLoading } = useOwnedLabelsQuery(spaceId);
  const { data: available } = useAvailableLabelsQuery(spaceId, !!spaceId);
  const createTree = useCreateLabelTreeMutation(spaceId);
  const updateTree = useUpdateLabelTreeMutation(spaceId);
  const deleteTree = useDeleteLabelTreeMutation(spaceId);
  const createNode = useCreateLabelNodeMutation(spaceId);
  const updateNode = useUpdateLabelNodeMutation(spaceId);
  const moveNode = useMoveLabelNodeMutation(spaceId);
  const deleteNode = useDeleteLabelNodeMutation(spaceId);
  const createLabel = useCreateLabelMutation(spaceId);
  const updateLabel = useUpdateLabelMutation(spaceId);
  const deleteLabel = useDeleteLabelMutation(spaceId);

  const trees = data?.trees ?? [];
  const freeLabels = data?.freeLabels ?? [];
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [treeForm, setTreeForm] = useState<TreeForm | null>(null);
  const [nodeForm, setNodeForm] = useState<NodeForm | null>(null);
  const [freeForm, setFreeForm] = useState<FreeForm | null>(null);

  const inheritedTrees = useMemo(
    () => available?.trees.filter((tree) => tree.spaceId === null) ?? [],
    [available],
  );

  const toggleExpanded = (nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const openTree = (tree?: ILabelTree) =>
    setTreeForm({
      tree: tree ?? null,
      name: tree?.name ?? "",
      description: tree?.description ?? "",
      color: tree?.color ?? null,
    });

  const openNode = (
    treeId: string,
    node?: ILabelNode,
    parentId: string | null = null,
  ) =>
    setNodeForm({
      treeId,
      node: node ?? null,
      parentId: node?.parentId ?? parentId,
      kind: node?.kind ?? "label",
      name: node?.name ?? "",
      description: node?.description ?? "",
      color: node?.color ?? null,
    });

  const openFreeLabel = (label?: ILabel) =>
    setFreeForm({
      label: label ?? null,
      name: label?.name ?? "",
      description: label?.description ?? "",
      color: label?.color ?? null,
    });

  const submitTree = () => {
    if (!treeForm || !treeForm.name.trim()) return;
    const values = {
      name: treeForm.name.trim(),
      description: treeForm.description.trim() || undefined,
      color: treeForm.color ?? undefined,
    };
    if (treeForm.tree) {
      updateTree.mutate({
        treeId: treeForm.tree.id,
        ...values,
        description: values.description ?? null,
        color: values.color ?? null,
      });
    } else createTree.mutate({ ...values, spaceId });
    setTreeForm(null);
  };

  const submitNode = () => {
    if (!nodeForm || !nodeForm.name.trim()) return;
    const values = {
      treeId: nodeForm.treeId,
      parentId: nodeForm.parentId,
      kind: nodeForm.kind,
      name: nodeForm.name.trim(),
      description: nodeForm.description.trim() || undefined,
      color: nodeForm.color ?? undefined,
    };
    if (nodeForm.node) {
      updateNode.mutate({
        nodeId: nodeForm.node.id,
        name: values.name,
        description: values.description ?? null,
        color: values.color ?? null,
      });
    } else createNode.mutate(values);
    setNodeForm(null);
  };

  const submitFreeLabel = () => {
    if (!freeForm || !freeForm.name.trim()) return;
    const values = {
      name: freeForm.name.trim(),
      description: freeForm.description.trim() || undefined,
      color: freeForm.color ?? undefined,
    };
    if (freeForm.label) {
      updateLabel.mutate({
        labelId: freeForm.label.id,
        ...values,
        description: values.description ?? null,
        color: values.color ?? null,
      });
    } else createLabel.mutate({ ...values, spaceId });
    setFreeForm(null);
  };

  const confirmDeleteTree = async (tree: ILabelTree) => {
    const impact = await getLabelTreeImpact(tree.id);
    modals.openConfirmModal({
      title: t("Delete label tree"),
      children: (
        <Text size="sm">
          {t(
            "Deleting {{name}} also deletes {{nodes}} nodes and removes their selections from {{pages}} page(s). This cannot be undone.",
            {
              name: tree.name,
              nodes: impact.nodeCount,
              pages: impact.pageCount,
            },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteTree.mutate(tree.id),
    });
  };

  const confirmDeleteNode = async (node: ILabelNode) => {
    const impact = await getLabelNodeImpact(node.id);
    modals.openConfirmModal({
      title: t("Delete label node"),
      children: (
        <Text size="sm">
          {t(
            "Deleting {{name}} also deletes its descendants and removes selections from {{pages}} page(s). This cannot be undone.",
            {
              name: node.name,
              pages: impact.pageCount,
            },
          )}
        </Text>
      ),
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteNode.mutate(node.id),
    });
  };

  const move = async (
    node: ILabelNode,
    parentId: string | null,
    position: number,
  ) => {
    if (parentId !== node.parentId) return;
    if (parentId === node.parentId && position === node.position) return;
    const input = { nodeId: node.id, parentId, position };
    const impact = await getMoveLabelNodeImpact(input);
    const confirm = () => moveNode.mutate(input);
    if (
      impact.pageCount === 0 ||
      impact.currentPath.join("/") === impact.nextPath.join("/")
    ) {
      confirm();
      return;
    }
    modals.openConfirmModal({
      title: t("Move label node"),
      children: (
        <Text size="sm">
          {t("This changes the path on {{pages}} page(s): {{from}} → {{to}}.", {
            pages: impact.pageCount,
            from: impact.currentPath.join(" / "),
            to: impact.nextPath.join(" / "),
          })}
        </Text>
      ),
      labels: { confirm: t("Move"), cancel: t("Cancel") },
      onConfirm: confirm,
    });
  };

  const nodesFor = (tree: ILabelTree, parentId: string | null) =>
    (tree.nodes ?? [])
      .filter((node) => node.parentId === parentId)
      .sort((a, b) => a.position - b.position || a.name.localeCompare(b.name));

  return (
    <Stack gap="xl">
      <Group className={classes.taxonomyActions} justify="flex-end">
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => openFreeLabel()}
        >
          {t("New free label")}
        </Button>
        <Button
          variant="default"
          leftSection={<IconPlus size={16} />}
          onClick={() => openTree()}
        >
          {t("New label tree")}
        </Button>
      </Group>

      {!isLoading && trees.length === 0 && freeLabels.length === 0 && (
        <Alert icon={<IconTag size={16} />} variant="light">
          {t(
            "No labels yet. Create a tree for hierarchical, mutually exclusive options or a free label for independent tagging.",
          )}
        </Alert>
      )}

      {trees.map((tree) => (
        <Stack key={tree.id} className={classes.treeCard} gap="md">
          <Group className={classes.treeHeader} justify="space-between">
            <div className={classes.treeHeaderMain}>
              <Text fw={600}>{tree.name}</Text>
              <Text size="xs" c="dimmed">
                {tree.description || t("One active path per document")}
              </Text>
            </div>
            <Group className={classes.treeHeaderActions} gap={4}>
              <Button
                size="compact-sm"
                variant="subtle"
                leftSection={<IconPlus size={14} />}
                onClick={() => openNode(tree.id)}
              >
                {t("Add item")}
              </Button>
              <ActionIcon
                variant="subtle"
                aria-label={t("Edit")}
                onClick={() => openTree(tree)}
              >
                <IconPencil size={15} />
              </ActionIcon>
              <ActionIcon
                variant="subtle"
                color="red"
                aria-label={t("Delete")}
                onClick={() => void confirmDeleteTree(tree)}
              >
                <IconTrash size={15} />
              </ActionIcon>
            </Group>
          </Group>
          <NodeList
            tree={tree}
            parentId={null}
            depth={0}
            expanded={expanded}
            onToggle={toggleExpanded}
            onAdd={openNode}
            onEdit={openNode}
            onDelete={(node) => void confirmDeleteNode(node)}
            onMove={move}
            nodesFor={nodesFor}
          />
        </Stack>
      ))}

      {freeLabels.length > 0 && (
        <Stack className={classes.secondarySection} gap="sm">
          <Text fw={600}>{t("Free labels")}</Text>
          <Group gap="xs">
            {freeLabels.map((label) => (
              <Group key={label.id} gap={2} wrap="nowrap">
                <LabelChip label={label} />
                <ActionIcon
                  variant="subtle"
                  size="sm"
                  aria-label={t("Edit")}
                  onClick={() => openFreeLabel(label)}
                >
                  <IconPencil size={14} />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size="sm"
                  aria-label={t("Delete")}
                  onClick={() =>
                    void getLabelUsageAndConfirm(label, deleteLabel.mutate, t)
                  }
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))}
          </Group>
        </Stack>
      )}

      {inheritedTrees.length > 0 && (
        <Stack className={classes.secondarySection} gap="sm">
          <Text fw={600}>{t("Inherited from the workspace")}</Text>
          <Text size="xs" c="dimmed">
            {t("Available in this space and managed by workspace admins.")}
          </Text>
          {inheritedTrees.map((tree) => (
            <Text key={tree.id} size="sm" c="dimmed">
              {tree.name}:{" "}
              {(tree.nodes ?? []).map((node) => node.name).join(" · ")}
            </Text>
          ))}
        </Stack>
      )}

      <TreeFormModal
        form={treeForm}
        onChange={setTreeForm}
        onClose={() => setTreeForm(null)}
        onSubmit={submitTree}
        loading={createTree.isPending || updateTree.isPending}
      />
      <NodeFormModal
        form={nodeForm}
        tree={trees.find((item) => item.id === nodeForm?.treeId)}
        onChange={setNodeForm}
        onClose={() => setNodeForm(null)}
        onSubmit={submitNode}
        loading={createNode.isPending || updateNode.isPending}
      />
      <FreeFormModal
        form={freeForm}
        onChange={setFreeForm}
        onClose={() => setFreeForm(null)}
        onSubmit={submitFreeLabel}
        loading={createLabel.isPending || updateLabel.isPending}
      />
    </Stack>
  );
}

type NodeListProps = {
  tree: ILabelTree;
  parentId: string | null;
  depth: number;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onAdd: (treeId: string, node?: ILabelNode, parentId?: string | null) => void;
  onEdit: (treeId: string, node?: ILabelNode, parentId?: string | null) => void;
  onDelete: (node: ILabelNode) => void;
  onMove: (node: ILabelNode, parentId: string | null, position: number) => void;
  nodesFor: (tree: ILabelTree, parentId: string | null) => ILabelNode[];
};

function NodeList({
  tree,
  parentId,
  depth,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  nodesFor,
}: NodeListProps) {
  const nodes = nodesFor(tree, parentId);
  return (
    <Stack
      gap={6}
      className={parentId === null ? undefined : classes.nodeListNested}
    >
      {nodes.map((node) => {
        const children = nodesFor(tree, node.id);
        return (
          <LabelNodeRow
            key={node.id}
            tree={tree}
            node={node}
            nodes={nodes}
            depth={depth}
            children={children}
            expanded={expanded}
            onToggle={onToggle}
            onAdd={onAdd}
            onEdit={onEdit}
            onDelete={onDelete}
            onMove={onMove}
            nodesFor={nodesFor}
          />
        );
      })}
    </Stack>
  );
}

function LabelNodeRow({
  tree,
  node,
  nodes,
  depth,
  children,
  expanded,
  onToggle,
  onAdd,
  onEdit,
  onDelete,
  onMove,
  nodesFor,
}: Omit<NodeListProps, "parentId"> & {
  node: ILabelNode;
  nodes: ILabelNode[];
  children: ILabelNode[];
}) {
  const { t } = useTranslation();
  const scheme = useComputedColorScheme("light");
  const rowRef = useRef<HTMLDivElement>(null);
  const dropTargetRef = useRef<HTMLDivElement>(null);
  const dragHandleRef = useRef<HTMLSpanElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [closestEdge, setClosestEdge] = useState<Edge | null>(null);
  const [isInvalidDrop, setIsInvalidDrop] = useState(false);
  const isOpen = expanded.has(node.id);

  useEffect(() => {
    const rowElement = rowRef.current;
    const dropTargetElement = dropTargetRef.current;
    const dragHandleElement = dragHandleRef.current;
    if (!rowElement || !dropTargetElement || !dragHandleElement) return;

    return combine(
      draggable({
        element: rowElement,
        dragHandle: dragHandleElement,
        getInitialData: () => ({
          type: LABEL_NODE_DRAG_TYPE,
          nodeId: node.id,
          treeId: node.treeId,
          parentId: node.parentId,
        }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
      }),
      dropTargetForElements({
        element: dropTargetElement,
        canDrop: ({ source }) =>
          source.data.type === LABEL_NODE_DRAG_TYPE &&
          source.data.treeId === tree.id &&
          source.data.nodeId !== node.id,
        getData: ({ input, element }) =>
          attachClosestEdge(
            { nodeId: node.id },
            { input, element, allowedEdges: ["top", "bottom"] },
          ),
        onDrag: ({ source, self }) => {
          const canReorder = canReorderLabelNodes(
            {
              id: String(source.data.nodeId),
              treeId: String(source.data.treeId),
              parentId: (source.data.parentId as string | null) ?? null,
            },
            node,
          );
          setIsInvalidDrop(!canReorder);
          setClosestEdge(canReorder ? extractClosestEdge(self.data) : null);
        },
        onDragLeave: () => {
          setClosestEdge(null);
          setIsInvalidDrop(false);
        },
        onDrop: ({ source, self }) => {
          setClosestEdge(null);
          setIsInvalidDrop(false);
          const sourceNode = nodes.find(
            (candidate) => candidate.id === source.data.nodeId,
          );
          const edge = extractClosestEdge(self.data);
          if (!sourceNode || (edge !== "top" && edge !== "bottom")) return;
          if (!canReorderLabelNodes(sourceNode, node)) return;
          const position = getSiblingDropPosition(
            nodes.map((candidate) => candidate.id),
            sourceNode.id,
            node.id,
            edge as LabelDropEdge,
          );
          if (position === null) return;
          onMove(sourceNode, node.parentId, position);
          triggerPostMoveFlash(dropTargetElement);
          liveRegion.announce(t("Label node reordered"));
        },
      }),
    );
  }, [node, nodes, onMove, t, tree.id]);

  const dropTargetClassName = [
    classes.nodeDropTarget,
    closestEdge === "top" ? classes.nodeDropAbove : "",
    closestEdge === "bottom" ? classes.nodeDropBelow : "",
    isInvalidDrop ? classes.nodeDropInvalid : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={rowRef}
      className={`${classes.nodeRow} ${isDragging ? classes.nodeDragging : ""}`}
      data-kind={node.kind}
      style={{ marginLeft: getNodeIndent(depth) }}
    >
      <div ref={dropTargetRef} className={dropTargetClassName}>
        <Group
          className={classes.nodeRowContent}
          gap={0}
          wrap="wrap"
          style={{ columnGap: 10, rowGap: 8 }}
        >
          <Group className={classes.nodeIdentity} gap="sm" wrap="nowrap">
            <ActionIcon
              size="sm"
              variant="subtle"
              onClick={() => onToggle(node.id)}
              aria-label={isOpen ? t("Collapse") : t("Expand")}
            >
              {children.length ? (
                isOpen ? (
                  <IconChevronDown size={15} />
                ) : (
                  <IconChevronRight size={15} />
                )
              ) : (
                <span style={{ width: 15 }} />
              )}
            </ActionIcon>
            <span
              ref={dragHandleRef}
              className={classes.nodeDragHandle}
              role="img"
              aria-label={t("Drag to reorder label node")}
            >
              <IconGripVertical size={14} color="gray" />
            </span>
            <LabelChip
              label={node}
              variant="dot"
              colorOverride={getLabelHierarchyColor(
                tree.name,
                tree.color,
                depth,
                scheme,
              )}
            />
          </Group>
          {node.description && (
            <Text className={classes.nodeDescription} size="sm" lineClamp={2}>
              {node.description}
            </Text>
          )}
          <Group className={classes.nodeActions} gap={0} wrap="wrap">
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t("Add child")}
              onClick={() => onAdd(tree.id, undefined, node.id)}
            >
              <IconPlus size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              aria-label={t("Edit")}
              onClick={() => onEdit(tree.id, node)}
            >
              <IconPencil size={14} />
            </ActionIcon>
            <ActionIcon
              size="sm"
              variant="subtle"
              color="red"
              aria-label={t("Delete")}
              onClick={() => onDelete(node)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Group>
        </Group>
      </div>
      {isOpen && (
        <NodeList
          tree={tree}
          parentId={node.id}
          depth={depth + 1}
          expanded={expanded}
          onToggle={onToggle}
          onAdd={onAdd}
          onEdit={onEdit}
          onDelete={onDelete}
          onMove={onMove}
          nodesFor={nodesFor}
        />
      )}
    </div>
  );
}

export const NODE_INDENT_PX = 22;

export function getNodeIndent(depth: number) {
  return depth > 0 ? NODE_INDENT_PX : 0;
}

function TreeFormModal({
  form,
  onChange,
  onClose,
  onSubmit,
  loading,
}: {
  form: TreeForm | null;
  onChange: (form: TreeForm | null) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={!!form}
      onClose={onClose}
      title={form?.tree ? t("Edit label tree") : t("New label tree")}
    >
      <Stack>
        {form && (
          <>
            <TextInput
              label={t("Name")}
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              autoFocus
            />
            <Textarea
              label={t("Description")}
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
            />
            <LabelColorPicker
              value={form.color}
              onChange={(color) => onChange({ ...form, color })}
              previewName={form.name || t("Tree")}
              fallbackColor={DEFAULT_LABEL_TREE_COLOR}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button loading={loading} onClick={onSubmit}>
                {form.tree ? t("Save") : t("Create")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

function NodeFormModal({
  form,
  tree,
  onChange,
  onClose,
  onSubmit,
  loading,
}: {
  form: NodeForm | null;
  tree?: ILabelTree;
  onChange: (form: NodeForm | null) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const parents = (tree?.nodes ?? [])
    .filter((node) => node.id !== form?.node?.id)
    .map((node) => ({
      value: node.id,
      label: `${node.kind === "group" ? "▸ " : ""}${node.name}`,
    }));
  return (
    <Modal
      opened={!!form}
      onClose={onClose}
      title={form?.node ? t("Edit label node") : t("New label node")}
    >
      <Stack>
        {form && (
          <>
            <TextInput
              label={t("Name")}
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              autoFocus
            />
            <Select
              label={t("Type")}
              data={[
                { value: "label", label: t("Label") },
                { value: "group", label: t("Group") },
              ]}
              value={form.kind}
              onChange={(kind) =>
                onChange({ ...form, kind: (kind as LabelNodeKind) || "label" })
              }
              disabled={!!form.node}
            />
            <Select
              label={t("Parent")}
              placeholder={t("Root node")}
              data={parents}
              value={form.parentId}
              onChange={(parentId) => onChange({ ...form, parentId })}
              clearable
              disabled={!!form.node}
              searchable
            />
            <Textarea
              label={t("Description")}
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button loading={loading} onClick={onSubmit}>
                {form.node ? t("Save") : t("Create")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

function FreeFormModal({
  form,
  onChange,
  onClose,
  onSubmit,
  loading,
}: {
  form: FreeForm | null;
  onChange: (form: FreeForm | null) => void;
  onClose: () => void;
  onSubmit: () => void;
  loading: boolean;
}) {
  const { t } = useTranslation();
  return (
    <Modal
      opened={!!form}
      onClose={onClose}
      title={form?.label ? t("Edit label") : t("New free label")}
    >
      <Stack>
        {form && (
          <>
            <TextInput
              label={t("Name")}
              value={form.name}
              onChange={(e) => onChange({ ...form, name: e.target.value })}
              autoFocus
            />
            <Textarea
              label={t("Description")}
              value={form.description}
              onChange={(e) =>
                onChange({ ...form, description: e.target.value })
              }
            />
            <LabelColorPicker
              value={form.color}
              onChange={(color) => onChange({ ...form, color })}
              previewName={form.name || t("Label")}
            />
            <Group justify="flex-end">
              <Button variant="default" onClick={onClose}>
                {t("Cancel")}
              </Button>
              <Button loading={loading} onClick={onSubmit}>
                {form.label ? t("Save") : t("Create")}
              </Button>
            </Group>
          </>
        )}
      </Stack>
    </Modal>
  );
}

async function getLabelUsageAndConfirm(
  label: ILabel,
  remove: (id: string) => void,
  t: (key: string, options?: Record<string, unknown>) => string,
) {
  const impact = await getLabelUsage(label.id);
  modals.openConfirmModal({
    title: t("Delete label"),
    children: (
      <Text size="sm">
        {t(
          "Deleting {{name}} removes it from {{pages}} page(s). This cannot be undone.",
          { name: label.name, pages: impact.pageCount },
        )}
      </Text>
    ),
    labels: { confirm: t("Delete"), cancel: t("Cancel") },
    confirmProps: { color: "red" },
    onConfirm: () => remove(label.id),
  });
}
