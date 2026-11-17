import {
  ActionIcon,
  Badge,
  Collapse,
  Group,
  Loader,
  Text,
  Tooltip,
} from "@mantine/core";
import { IconChevronDown, IconFocusCentered } from "@tabler/icons-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { getPageTitle } from "@/features/page/page.utils.ts";
import { resolveCircleCollisions } from "@/lib/graph-collision";
import classes from "./page-graph-view.module.css";

const VIEWBOX_WIDTH = 320;
const VIEWBOX_HEIGHT = 272;
const GRAPH_SCALE = 0.65;
const GRAPH_BOUND_X = 142;
const GRAPH_BOUND_Y = 118;
const COLLISION_PADDING = 1.5;

/**
 * A node as the callers describe it. `href` is the route to open on click and
 * is null for the page the graph is centred on, so the same view works for the
 * authenticated space routes.
 */
export type PageGraphNodeInput = {
  id: string;
  title: string | null;
  isBase?: boolean;
  href: string | null;
};

type Point = { x: number; y: number };
type Viewport = Point & { scale: number };

type GraphNode = PageGraphNodeInput & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  fixed: boolean;
  radius: number;
};

type GraphEdge = {
  sourcePageId: string;
  targetPageId: string;
};

type CanvasDrag = {
  pointerId: number;
  clientX: number;
  clientY: number;
  origin: Point;
};

type NodeDrag = {
  id: string;
  pointerId: number;
  clientX: number;
  clientY: number;
  origin: Point;
  last: Point;
};

interface PageGraphViewProps {
  current: PageGraphNodeInput;
  neighbors: PageGraphNodeInput[];
  hiddenCount?: number;
  isLoading?: boolean;
}

export function PageGraphView({
  current,
  neighbors,
  hiddenCount = 0,
  isLoading = false,
}: PageGraphViewProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [opened, setOpened] = useState(true);
  const [viewport, setViewport] = useState<Viewport>({ x: 0, y: 0, scale: 1 });
  const [positions, setPositions] = useState<Record<string, Point>>({});
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const nodesRef = useRef<GraphNode[]>([]);
  const edgesRef = useRef<GraphEdge[]>([]);
  const animationRef = useRef<number | null>(null);
  const remainingFramesRef = useRef(0);
  const canvasDragRef = useRef<CanvasDrag | null>(null);
  const nodeDragRef = useRef<NodeDrag | null>(null);
  const draggedRef = useRef(false);

  const graphNodes = useMemo<GraphNode[]>(
    () =>
      [current, ...neighbors].map((node) => ({
        ...node,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        fixed: false,
        radius: graphNodeRadius(node.id === current.id ? neighbors.length : 1),
      })),
    [current, neighbors],
  );

  const graphEdges = useMemo<GraphEdge[]>(
    () =>
      neighbors.map((neighbor) => ({
        sourcePageId: current.id,
        targetPageId: neighbor.id,
      })),
    [current.id, neighbors],
  );

  const graphKey = useMemo(
    () => graphNodes.map((node) => node.id).join(","),
    [graphNodes],
  );

  const publishPositions = () => {
    setPositions(
      Object.fromEntries(
        nodesRef.current.map((node) => [node.id, { x: node.x, y: node.y }]),
      ),
    );
  };

  const tick = () => {
    runGraphStep(nodesRef.current, edgesRef.current);
    publishPositions();
    if (!nodeDragRef.current) remainingFramesRef.current -= 1;
    if (nodeDragRef.current || remainingFramesRef.current > 0) {
      animationRef.current = requestAnimationFrame(tick);
    } else {
      animationRef.current = null;
    }
  };

  const startSimulation = (frames = 150) => {
    remainingFramesRef.current = Math.max(remainingFramesRef.current, frames);
    if (animationRef.current === null) {
      animationRef.current = requestAnimationFrame(tick);
    }
  };

  useEffect(() => {
    if (!opened || graphNodes.length === 0) return;
    nodesRef.current = graphNodes.map((node, index) => ({
      ...node,
      ...initialPosition(node.id, index, graphNodes.length, layoutVersion),
      vx: 0,
      vy: 0,
      fixed: false,
    }));
    edgesRef.current = graphEdges;
    publishPositions();
    startSimulation(170);

    return () => {
      if (animationRef.current !== null) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
    };
  }, [graphKey, layoutVersion, opened]);

  useEffect(() => {
    setViewport({ x: 0, y: 0, scale: 1 });
    setHoveredId(null);
  }, [current.id]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setViewport((currentViewport) => ({
        ...currentViewport,
        scale: clamp(
          currentViewport.scale * (event.deltaY > 0 ? 0.9 : 1.1),
          0.65,
          2.8,
        ),
      }));
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [opened, current.id]);

  const positionedNodes = nodesRef.current.map((node) => ({
    ...node,
    ...(positions[node.id] ?? node),
  }));
  const nodeById = new Map(positionedNodes.map((node) => [node.id, node]));
  const degree = new Map<string, number>();
  const adjacency = new Map<string, Set<string>>();
  const link = (from: string, to: string) => {
    const entry = adjacency.get(from);
    if (entry) entry.add(to);
    else adjacency.set(from, new Set([to]));
  };
  for (const edge of edgesRef.current) {
    degree.set(edge.sourcePageId, (degree.get(edge.sourcePageId) ?? 0) + 1);
    degree.set(edge.targetPageId, (degree.get(edge.targetPageId) ?? 0) + 1);
    link(edge.sourcePageId, edge.targetPageId);
    link(edge.targetPageId, edge.sourcePageId);
  }
  const hoveredNeighbors = hoveredId ? adjacency.get(hoveredId) : undefined;

  const resetView = () => {
    setViewport({ x: 0, y: 0, scale: 1 });
    setLayoutVersion((version) => version + 1);
  };

  const viewDelta = (clientX: number, clientY: number, start: Point) => {
    const rect = svgRef.current?.getBoundingClientRect();
    return {
      x: ((clientX - start.x) * VIEWBOX_WIDTH) / (rect?.width || VIEWBOX_WIDTH),
      y:
        ((clientY - start.y) * VIEWBOX_HEIGHT) /
        (rect?.height || VIEWBOX_HEIGHT),
    };
  };

  const handleCanvasDown = (event: React.PointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    canvasDragRef.current = {
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: { x: viewport.x, y: viewport.y },
    };
  };

  const handleCanvasMove = (event: React.PointerEvent<SVGSVGElement>) => {
    const drag = canvasDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = viewDelta(event.clientX, event.clientY, {
      x: drag.clientX,
      y: drag.clientY,
    });
    if (Math.abs(delta.x) + Math.abs(delta.y) > 3) draggedRef.current = true;
    setViewport((currentViewport) => ({
      ...currentViewport,
      x: drag.origin.x + delta.x,
      y: drag.origin.y + delta.y,
    }));
  };

  const handleCanvasUp = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    canvasDragRef.current = null;
  };

  const handleNodeDown = (
    event: React.PointerEvent<SVGGElement>,
    node: GraphNode,
  ) => {
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    draggedRef.current = false;
    const simulationNode = nodesRef.current.find((item) => item.id === node.id);
    if (simulationNode) simulationNode.fixed = true;
    nodeDragRef.current = {
      id: node.id,
      pointerId: event.pointerId,
      clientX: event.clientX,
      clientY: event.clientY,
      origin: { x: node.x, y: node.y },
      last: { x: node.x, y: node.y },
    };
    startSimulation();
  };

  const handleNodeMove = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const delta = viewDelta(event.clientX, event.clientY, {
      x: drag.clientX,
      y: drag.clientY,
    });
    if (Math.abs(delta.x) + Math.abs(delta.y) > 3) draggedRef.current = true;
    const node = nodesRef.current.find((item) => item.id === drag.id);
    if (!node) return;
    const next = {
      x: clamp(
        drag.origin.x + delta.x / viewport.scale,
        -GRAPH_BOUND_X,
        GRAPH_BOUND_X,
      ),
      y: clamp(
        drag.origin.y + delta.y / viewport.scale,
        -GRAPH_BOUND_Y,
        GRAPH_BOUND_Y,
      ),
    };
    node.vx = (next.x - drag.last.x) * 0.55;
    node.vy = (next.y - drag.last.y) * 0.55;
    node.x = next.x;
    node.y = next.y;
    drag.last = next;
    publishPositions();
  };

  const handleNodeUp = (event: React.PointerEvent<SVGGElement>) => {
    event.stopPropagation();
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const drag = nodeDragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const node = nodesRef.current.find((item) => item.id === drag.id);
    if (node) node.fixed = false;
    nodeDragRef.current = null;
    startSimulation(180);
  };

  const openPage = (node: GraphNode) => {
    if (draggedRef.current || !node.href) return;
    navigate(node.href);
  };

  const currentTitle = getPageTitle(current.title, current.isBase, t);

  return (
    <section
      className={classes.graphSection}
      data-collapsed={!opened || undefined}
      aria-label={t("Local graph")}
    >
      <Group
        className={classes.header}
        justify="space-between"
        gap="xs"
        wrap="nowrap"
      >
        <button
          type="button"
          className={classes.headerButton}
          onClick={() => setOpened((value) => !value)}
          aria-expanded={opened}
        >
          <IconChevronDown
            size={14}
            className={classes.chevron}
            data-opened={opened || undefined}
          />
          <Text component="span" className={classes.headerLabel}>
            {t("Local graph")}
          </Text>
          {!isLoading && (
            <Badge size="xs" variant="light">
              {graphNodes.length}
            </Badge>
          )}
        </button>

        {opened && (
          <Tooltip label={t("Reset graph view")} withArrow position="top">
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={resetView}
              aria-label={t("Reset graph view")}
            >
              <IconFocusCentered size={16} />
            </ActionIcon>
          </Tooltip>
        )}
      </Group>

      <Collapse expanded={opened}>
        <div ref={canvasRef} className={classes.canvas}>
          {isLoading ? (
            <div className={classes.centerState}>
              <Loader size="sm" />
            </div>
          ) : (
            <>
              <svg
                ref={svgRef}
                viewBox={`0 0 ${VIEWBOX_WIDTH} ${VIEWBOX_HEIGHT}`}
                className={classes.svg}
                role="img"
                aria-label={t("Relationships for {{title}}", {
                  title: currentTitle,
                })}
                onPointerDown={handleCanvasDown}
                onPointerMove={handleCanvasMove}
                onPointerUp={handleCanvasUp}
                onPointerCancel={handleCanvasUp}
              >
                <g
                  transform={`translate(${VIEWBOX_WIDTH / 2 + viewport.x} ${VIEWBOX_HEIGHT / 2 + viewport.y}) scale(${viewport.scale})`}
                >
                  {edgesRef.current.map((edge) => {
                    const source = nodeById.get(edge.sourcePageId);
                    const target = nodeById.get(edge.targetPageId);
                    if (!source || !target) return null;
                    const active =
                      hoveredId === source.id || hoveredId === target.id;
                    return (
                      <line
                        key={`${edge.sourcePageId}-${edge.targetPageId}`}
                        x1={source.x}
                        y1={source.y}
                        x2={target.x}
                        y2={target.y}
                        className={classes.edge}
                        data-active={active || undefined}
                      />
                    );
                  })}

                  {positionedNodes.map((node) => {
                    const title = getPageTitle(node.title, node.isBase, t);
                    const connections = degree.get(node.id) ?? 0;
                    const radius = node.radius;
                    const active =
                      !hoveredId ||
                      hoveredId === node.id ||
                      Boolean(hoveredNeighbors?.has(node.id));
                    const isCurrent = node.id === current.id;
                    return (
                      <g
                        key={node.id}
                        className={classes.node}
                        data-active={active || undefined}
                        data-current={isCurrent || undefined}
                        data-isolated={connections === 0 || undefined}
                        transform={`translate(${node.x} ${node.y})`}
                        role={isCurrent ? "img" : "link"}
                        tabIndex={isCurrent ? -1 : 0}
                        aria-label={
                          isCurrent ? title : t("Open {{title}}", { title })
                        }
                        onMouseEnter={() => setHoveredId(node.id)}
                        onMouseLeave={() => setHoveredId(null)}
                        onFocus={() => setHoveredId(node.id)}
                        onBlur={() => setHoveredId(null)}
                        onClick={() => openPage(node)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openPage(node);
                          }
                        }}
                        onPointerDown={(event) => handleNodeDown(event, node)}
                        onPointerMove={handleNodeMove}
                        onPointerUp={handleNodeUp}
                        onPointerCancel={handleNodeUp}
                      >
                        <circle r={radius} />
                        {hoveredId === node.id && (
                          <text y={-(radius + 5)} textAnchor="middle">
                            {truncateLabel(title, 22)}
                          </text>
                        )}
                        <title>{title}</title>
                      </g>
                    );
                  })}
                </g>
              </svg>

              {neighbors.length === 0 && (
                <Text className={classes.emptyState} size="xs" c="dimmed">
                  {t("No links from this page yet")}
                </Text>
              )}

              {hiddenCount > 0 && (
                <Text className={classes.hiddenCount} size="xs" c="dimmed">
                  {t("+{{count}} more pages", { count: hiddenCount })}
                </Text>
              )}
            </>
          )}
        </div>
      </Collapse>
    </section>
  );
}

function initialPosition(
  id: string,
  index: number,
  count: number,
  version: number,
) {
  const angle = seededValue(`${id}-${version}`) * Math.PI * 2 + index * 2.39996;
  const rings = Math.max(1, Math.sqrt(count));
  const distance =
    (34 + Math.sqrt(index / rings) * 34 + seededValue(id) * 45) * GRAPH_SCALE;
  return {
    x: Math.cos(angle) * distance * 1.65,
    y: Math.sin(angle) * distance,
  };
}

function runGraphStep(nodes: GraphNode[], edges: GraphEdge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  for (const edge of edges) {
    const source = byId.get(edge.sourcePageId);
    const target = byId.get(edge.targetPageId);
    if (!source || !target) continue;
    const dx = target.x - source.x || 0.01;
    const dy = target.y - source.y || 0.01;
    const distance = Math.max(Math.hypot(dx, dy), 1);
    const force = (distance - 62 * GRAPH_SCALE) * 0.006;
    const fx = (dx / distance) * force;
    const fy = (dy / distance) * force;
    if (!source.fixed) {
      source.vx += fx;
      source.vy += fy;
    }
    if (!target.fixed) {
      target.vx -= fx;
      target.vy -= fy;
    }
  }

  const comparisonWindow = nodes.length > 180 ? 24 : nodes.length;
  for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
    const left = nodes[leftIndex];
    for (let offset = 1; offset < comparisonWindow; offset += 1) {
      const rightIndex = (leftIndex + offset) % nodes.length;
      if (rightIndex <= leftIndex) continue;
      const right = nodes[rightIndex];
      const dx = right.x - left.x || 0.01;
      const dy = right.y - left.y || 0.01;
      const distanceSquared = Math.max(
        dx * dx + dy * dy,
        64 * GRAPH_SCALE * GRAPH_SCALE,
      );
      const distance = Math.sqrt(distanceSquared);
      const force = Math.min(
        1.15 * GRAPH_SCALE,
        (500 * GRAPH_SCALE * GRAPH_SCALE) / distanceSquared,
      );
      const fx = (dx / distance) * force;
      const fy = (dy / distance) * force;
      if (!left.fixed) {
        left.vx -= fx;
        left.vy -= fy;
      }
      if (!right.fixed) {
        right.vx += fx;
        right.vy += fy;
      }
    }
  }

  for (const node of nodes) {
    if (node.fixed) continue;
    node.vx += -node.x * 0.00045;
    node.vy += -node.y * 0.0007;
    node.vx *= 0.88;
    node.vy *= 0.88;
    node.x = clamp(node.x + node.vx, -GRAPH_BOUND_X, GRAPH_BOUND_X);
    node.y = clamp(node.y + node.vy, -GRAPH_BOUND_Y, GRAPH_BOUND_Y);
  }

  resolveCircleCollisions(
    nodes,
    {
      minX: -GRAPH_BOUND_X,
      maxX: GRAPH_BOUND_X,
      minY: -GRAPH_BOUND_Y,
      maxY: GRAPH_BOUND_Y,
    },
    COLLISION_PADDING,
  );
}

function graphNodeRadius(connections: number) {
  return clamp(4.5 + Math.sqrt(connections) * 1.5, 4.5, 11);
}

function truncateLabel(value: string, max: number) {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function seededValue(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967295;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}
