import { NodeViewProps } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import mermaid from "mermaid";
import { v4 as uuidv4 } from "uuid";
import classes from "./code-block.module.css";
import { useTranslation } from "react-i18next";
import {
  ActionIcon,
  Group,
  Modal,
  Text,
  Tooltip,
  useComputedColorScheme,
} from "@mantine/core";
import {
  IconArrowsMaximize,
  IconZoomIn,
  IconZoomOut,
  IconZoomReset,
} from "@tabler/icons-react";
import DOMPurify from "dompurify";

interface MermaidViewProps {
  props: NodeViewProps;
}

const DEFAULT_ZOOM = 1;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 3;
const ZOOM_STEP = 0.25;

interface Point {
  x: number;
  y: number;
}

interface ViewerState {
  zoom: number;
  offset: Point;
}

interface PanStart {
  clientX: number;
  clientY: number;
  offset: Point;
}

interface MermaidPreviewProps {
  preview: string;
}

function MermaidPreview({ preview }: MermaidPreviewProps) {
  return (
    <div
      className={classes.mermaid}
      contentEditable={false}
      dangerouslySetInnerHTML={{ __html: preview }}
    />
  );
}

function createDefaultViewerState(): ViewerState {
  return {
    zoom: DEFAULT_ZOOM,
    offset: { x: 0, y: 0 },
  };
}

function clampZoom(zoom: number) {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

function getViewerWithZoomAt(
  viewer: ViewerState,
  anchor: Point,
  zoom: number,
): ViewerState {
  const nextZoom = clampZoom(zoom);

  if (nextZoom === viewer.zoom) {
    return viewer;
  }

  const diagramPoint = {
    x: (anchor.x - viewer.offset.x) / viewer.zoom,
    y: (anchor.y - viewer.offset.y) / viewer.zoom,
  };

  return {
    zoom: nextZoom,
    offset: {
      x: anchor.x - diagramPoint.x * nextZoom,
      y: anchor.y - diagramPoint.y * nextZoom,
    },
  };
}

export default function MermaidView({ props }: MermaidViewProps) {
  const { t } = useTranslation();
  const computedColorScheme = useComputedColorScheme();
  const { node } = props;
  const [preview, setPreview] = useState<string>("");
  const [opened, setOpened] = useState(false);
  const [viewer, setViewer] = useState<ViewerState>(createDefaultViewerState);
  const [isPanning, setIsPanning] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const panStartRef = useRef<PanStart | null>(null);

  // Update Mermaid config when theme changes.
  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      suppressErrorRendering: true,
      theme: computedColorScheme === "light" ? "default" : "dark",
    });
  }, [computedColorScheme]);

  // Re-render the diagram whenever the node content or theme changes.
  useEffect(() => {
    const id = `mermaid-${uuidv4()}`;
    if (node.textContent.length > 0) {
      mermaid
        .render(id, node.textContent)
        .then((item) => {
          setPreview(item.svg);
        })
        .catch((err) => {
          if (props.editor.isEditable) {
            setPreview(
              `<div class="${classes.error}">${t("Mermaid diagram error:")} ${DOMPurify.sanitize(err)}</div>`,
            );
          } else {
            setPreview(
              `<div class="${classes.error}">${t("Invalid Mermaid diagram")}</div>`,
            );
          }
        });
    }
  }, [node.textContent, computedColorScheme, props.editor.isEditable, t]);

  function resetViewer() {
    panStartRef.current = null;
    setIsPanning(false);
    setViewer(createDefaultViewerState());
  }

  function updateZoomAt(
    anchor: Point,
    getNextZoom: (currentZoom: number) => number,
  ) {
    setViewer((currentViewer) =>
      getViewerWithZoomAt(
        currentViewer,
        anchor,
        getNextZoom(currentViewer.zoom),
      ),
    );
  }

  useEffect(() => {
    const viewport = viewportRef.current;

    if (!opened || !viewport) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      event.preventDefault();

      if (event.deltaY === 0) {
        return;
      }

      const rect = viewport.getBoundingClientRect();

      setViewer((currentViewer) =>
        getViewerWithZoomAt(
          currentViewer,
          {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
          },
          currentViewer.zoom + (event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP),
        ),
      );
    }

    viewport.addEventListener("wheel", handleWheel, { passive: false });

    return () => {
      viewport.removeEventListener("wheel", handleWheel);
    };
  }, [opened]);

  function openViewer() {
    resetViewer();
    setOpened(true);
  }

  function closeViewer() {
    setOpened(false);
    resetViewer();
  }

  function changeZoom(delta: number) {
    const viewport = viewportRef.current;

    if (!viewport) {
      return;
    }

    const rect = viewport.getBoundingClientRect();

    updateZoomAt(
      { x: rect.width / 2, y: rect.height / 2 },
      (currentZoom) => currentZoom + delta,
    );
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.button !== 0) {
      return;
    }

    event.preventDefault();
    event.currentTarget.setPointerCapture?.(event.pointerId);
    panStartRef.current = {
      clientX: event.clientX,
      clientY: event.clientY,
      offset: viewer.offset,
    };
    setIsPanning(true);
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const panStart = panStartRef.current;

    if (!panStart) {
      return;
    }

    event.preventDefault();
    setViewer((currentViewer) => ({
      ...currentViewer,
      offset: {
        x: panStart.offset.x + event.clientX - panStart.clientX,
        y: panStart.offset.y + event.clientY - panStart.clientY,
      },
    }));
  }

  function stopPanning(event: ReactPointerEvent<HTMLDivElement>) {
    if (!panStartRef.current) {
      return;
    }

    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture?.(event.pointerId);
    }

    panStartRef.current = null;
    setIsPanning(false);
  }

  return (
    <>
      <div className={classes.previewContainer} contentEditable={false}>
        <MermaidPreview preview={preview} />
        {preview && (
          <div className={classes.previewToolbar}>
            <Tooltip label={t("Expand Mermaid diagram")} withArrow>
              <ActionIcon
                variant="subtle"
                color="gray"
                aria-label={t("Expand Mermaid diagram")}
                onClick={openViewer}
              >
                <IconArrowsMaximize size={18} />
              </ActionIcon>
            </Tooltip>
          </div>
        )}
      </div>

      <Modal.Root
        opened={opened}
        onClose={closeViewer}
        fullScreen
        aria-label={t("Mermaid diagram preview")}
      >
        <Modal.Overlay />
        <Modal.Content className={classes.viewerContent}>
          <Modal.Header>
            <Modal.Title>
              <Text size="md" fw={500}>
                {t("Mermaid diagram")}
              </Text>
            </Modal.Title>
            <Modal.CloseButton aria-label={t("Close")} />
          </Modal.Header>
          <Modal.Body p={0} className={classes.viewerBody}>
            <Group
              justify="flex-end"
              gap="xs"
              className={classes.viewerToolbar}
              contentEditable={false}
            >
              <Tooltip label={t("Zoom out")} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("Zoom out")}
                  onClick={() => changeZoom(-ZOOM_STEP)}
                  disabled={viewer.zoom <= MIN_ZOOM}
                >
                  <IconZoomOut size={18} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label={t("Reset view")} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("Reset view")}
                  onClick={resetViewer}
                  disabled={
                    viewer.zoom === DEFAULT_ZOOM &&
                    viewer.offset.x === 0 &&
                    viewer.offset.y === 0
                  }
                >
                  <IconZoomReset size={18} />
                </ActionIcon>
              </Tooltip>

              <Tooltip label={t("Zoom in")} withArrow>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  aria-label={t("Zoom in")}
                  onClick={() => changeZoom(ZOOM_STEP)}
                  disabled={viewer.zoom >= MAX_ZOOM}
                >
                  <IconZoomIn size={18} />
                </ActionIcon>
              </Tooltip>
            </Group>

            <div
              ref={viewportRef}
              className={`${classes.viewerViewport} ${
                isPanning ? classes.viewerViewportPanning : ""
              }`}
              data-testid="mermaid-viewer-viewport"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={stopPanning}
              onPointerCancel={stopPanning}
              onAuxClick={(event) => event.preventDefault()}
            >
              <div
                className={classes.viewerCanvas}
                data-testid="mermaid-zoom-canvas"
                style={{
                  transform: `translate3d(${viewer.offset.x}px, ${viewer.offset.y}px, 0) scale(${viewer.zoom})`,
                }}
              >
                <MermaidPreview preview={preview} />
              </div>
            </div>
          </Modal.Body>
        </Modal.Content>
      </Modal.Root>
    </>
  );
}
