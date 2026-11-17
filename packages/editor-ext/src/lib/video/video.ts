import { ReactNodeViewRenderer } from "@tiptap/react";
import { Range, Node, mergeAttributes } from "@tiptap/core";
import { ResizableNodeView } from "../resizable-nodeview";
import type { ResizableNodeViewDirection } from "../resizable-nodeview";
import { normalizeFileUrl } from "../media-utils";

export type VideoResizeOptions = {
  enabled: boolean;
  directions?: ResizableNodeViewDirection[];
  minWidth?: number;
  minHeight?: number;
  alwaysPreserveAspectRatio?: boolean;
  createCustomHandle?: (direction: ResizableNodeViewDirection) => HTMLElement;
  className?: {
    container?: string;
    wrapper?: string;
    handle?: string;
    resizing?: string;
  };
};

export interface VideoOptions {
  view: any;
  HTMLAttributes: Record<string, any>;
  resize: VideoResizeOptions | false;
}

export interface VideoAttributes {
  src?: string;
  alt?: string;
  align?: string;
  attachmentId?: string;
  size?: number;
  width?: number | string;
  height?: number;
  aspectRatio?: number;
  placeholder?: {
    id: string;
    name: string;
  };
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    videoBlock: {
      setVideo: (attributes: VideoAttributes) => ReturnType;
      setVideoAt: (
        attributes: VideoAttributes & { pos: number | Range }
      ) => ReturnType;
      setVideoAlign: (align: "left" | "center" | "right") => ReturnType;
      setVideoWidth: (width: number) => ReturnType;
      setVideoSize: (width: number, height: number) => ReturnType;
    };
  }
}

export const TiptapVideo = Node.create<VideoOptions>({
  name: "video",

  group: "block",
  isolating: true,
  atom: true,
  defining: true,
  draggable: true,

  addOptions() {
    return {
      view: null,
      HTMLAttributes: {},
      resize: false,
    };
  },

  addAttributes() {
    return {
      src: {
        default: "",
        parseHTML: (element) => element.getAttribute("src"),
        renderHTML: (attributes) => ({
          src: attributes.src,
        }),
      },
      alt: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("aria-label"),
        renderHTML: (attributes: VideoAttributes) => ({
          "aria-label": attributes.alt,
        }),
      },
      attachmentId: {
        default: undefined,
        parseHTML: (element) => element.getAttribute("data-attachment-id"),
        renderHTML: (attributes: VideoAttributes) => ({
          "data-attachment-id": attributes.attachmentId,
        }),
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("width");
          if (!raw) return null;
          if (raw.endsWith("%")) return raw;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: VideoAttributes) => ({
          width: attributes.width,
        }),
      },
      height: {
        default: null,
        parseHTML: (element) => {
          const raw = element.getAttribute("height");
          if (!raw) return null;
          const num = parseFloat(raw);
          return isNaN(num) ? null : num;
        },
        renderHTML: (attributes: VideoAttributes) => ({
          height: attributes.height,
        }),
      },
      size: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-size"),
        renderHTML: (attributes: VideoAttributes) => ({
          "data-size": attributes.size,
        }),
      },
      align: {
        default: "center",
        parseHTML: (element) => element.getAttribute("data-align"),
        renderHTML: (attributes: VideoAttributes) => ({
          "data-align": attributes.align,
        }),
      },
      aspectRatio: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-aspect-ratio"),
        renderHTML: (attributes: VideoAttributes) => ({
          "data-aspect-ratio": attributes.aspectRatio,
        }),
      },
      placeholder: {
        default: null,
        rendered: false,
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "video",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "video",
      { controls: "true", ...HTMLAttributes },
      ["source", HTMLAttributes],
    ];
  },

  addCommands() {
    return {
      setVideo:
        (attrs: VideoAttributes) =>
        ({ commands }) => {
          return commands.insertContent({
            type: "video",
            attrs: attrs,
          });
        },

      setVideoAlign:
        (align) =>
        ({ commands }) =>
          commands.updateAttributes("video", { align }),

      setVideoWidth:
        (width) =>
        ({ commands }) =>
          commands.updateAttributes("video", {
            width: `${Math.max(0, Math.min(100, width))}%`,
          }),

      setVideoSize:
        (width, height) =>
        ({ commands }) =>
          commands.updateAttributes("video", { width, height }),
    };
  },

  addNodeView() {
    const resize = this.options.resize;

    if (!resize || !resize.enabled) {
      this.editor.isInitialized = true;
      return ReactNodeViewRenderer(this.options.view);
    }

    const {
      directions,
      minWidth,
      minHeight,
      alwaysPreserveAspectRatio,
      createCustomHandle,
      className,
    } = resize;

    return (props) => {
      const { node, getPos, HTMLAttributes, editor } = props;

      if (!node.attrs.src) {
        editor.isInitialized = true;
        const reactView = ReactNodeViewRenderer(this.options.view);
        const view = reactView(props);

        const originalUpdate = view.update?.bind(view);
        view.update = (updatedNode, decorations, innerDecorations) => {
          if (updatedNode.attrs.src && !node.attrs.src) {
            return false;
          }
          if (originalUpdate) {
            return originalUpdate(updatedNode, decorations, innerDecorations);
          }
          return true;
        };

        return view;
      }

      const frame = document.createElement("div");
      frame.dataset.videoPlaceholder = "";
      frame.style.display = "flex";
      frame.style.alignItems = "center";
      frame.style.justifyContent = "center";
      frame.style.width = "640px";
      frame.style.maxWidth = "100%";
      frame.style.aspectRatio = node.attrs.aspectRatio || "16 / 9";
      frame.style.overflow = "hidden";
      frame.style.borderRadius = "8px";
      frame.style.background = "#111";
      frame.style.color = "#fff";

      const placeholderLabel = document.createElement("span");
      placeholderLabel.textContent = node.attrs.alt || "Video";
      placeholderLabel.style.padding = "16px";
      placeholderLabel.style.overflow = "hidden";
      placeholderLabel.style.textOverflow = "ellipsis";
      placeholderLabel.style.whiteSpace = "nowrap";
      frame.appendChild(placeholderLabel);
      if (node.attrs.alt) frame.setAttribute("aria-label", node.attrs.alt);

      if (typeof node.attrs.width === "number" && node.attrs.width > 0) {
        frame.style.width = `${node.attrs.width}px`;
        if (typeof node.attrs.height === "number" && node.attrs.height > 0) {
          frame.style.height = `${node.attrs.height}px`;
        }
      }

      let currentNode = node;
      let sourceLoaded = false;
      let video: HTMLVideoElement | undefined;
      let visibilityObserver: IntersectionObserver | undefined;

      const loadSource = () => {
        if (sourceLoaded || !currentNode.attrs.src) return;
        sourceLoaded = true;
        visibilityObserver?.disconnect();
        video = document.createElement("video");
        video.controls = true;
        video.preload = "metadata";
        video.classList.add("media-pulse");
        video.src = normalizeFileUrl(currentNode.attrs.src);
        video.style.display = "block";
        video.style.width = "100%";
        video.style.height = "100%";
        video.style.objectFit = "contain";
        if (currentNode.attrs.alt) {
          video.setAttribute("aria-label", currentNode.attrs.alt);
        }
        video.onloadedmetadata = () => {
          video?.classList.remove("media-pulse");
        };
        frame.replaceChildren(video);
      };

      const observeVisibility = () => {
        visibilityObserver?.disconnect();
        if (typeof IntersectionObserver === "undefined") {
          loadSource();
          return;
        }
        visibilityObserver = new IntersectionObserver(
          (entries) => {
            if (entries.some((entry) => entry.isIntersecting)) loadSource();
          },
          { rootMargin: "200px 0px" },
        );
        visibilityObserver.observe(frame);
      };

      frame.addEventListener("click", loadSource);

      const nodeView = new ResizableNodeView({
        element: frame,
        editor,
        node,
        getPos,
        onResize: (w, h) => {
          frame.style.width = `${w}px`;
          frame.style.height = `${h}px`;
        },
        onCommit: () => {
          const pos = getPos();
          if (pos === undefined) return;

          this.editor
            .chain()
            .setNodeSelection(pos)
            .updateAttributes(this.name, {
              width: Math.round(frame.offsetWidth),
              height: Math.round(frame.offsetHeight),
            })
            .run();
        },
        onUpdate: (updatedNode, _decorations, _innerDecorations) => {
          if (updatedNode.type !== currentNode.type) {
            return false;
          }

          if (updatedNode.attrs.src !== currentNode.attrs.src) {
            video?.removeAttribute("src");
            video = undefined;
            frame.replaceChildren(placeholderLabel);
            sourceLoaded = false;
          }

          if (updatedNode.attrs.alt !== currentNode.attrs.alt) {
            if (updatedNode.attrs.alt) {
              frame.setAttribute("aria-label", updatedNode.attrs.alt);
              placeholderLabel.textContent = updatedNode.attrs.alt;
              video?.setAttribute("aria-label", updatedNode.attrs.alt);
            } else {
              frame.removeAttribute("aria-label");
              placeholderLabel.textContent = "Video";
              video?.removeAttribute("aria-label");
            }
          }

          const w = updatedNode.attrs.width;
          const h = updatedNode.attrs.height;
          if (w != null) {
            frame.style.width = `${w}px`;
          }
          if (h != null) {
            frame.style.height = `${h}px`;
          }

          const align = updatedNode.attrs.align || "center";
          const container = nodeView.dom as HTMLElement;
          applyAlignment(container, align);

          currentNode = updatedNode;
          if (!sourceLoaded) observeVisibility();
          return true;
        },
        options: {
          directions,
          min: {
            width: minWidth,
            height: minHeight,
          },
          preserveAspectRatio: alwaysPreserveAspectRatio === true,
          createCustomHandle,
          className,
        },
      });

      const dom = nodeView.dom as HTMLElement;
      const destroyNodeView = nodeView.destroy.bind(nodeView);
      nodeView.destroy = () => {
        visibilityObserver?.disconnect();
        frame.removeEventListener("click", loadSource);
        video?.removeAttribute("src");
        destroyNodeView();
      };

      applyAlignment(dom, node.attrs.align || "center");
      observeVisibility();

      // Handle percentage width backward compat
      const widthAttr = node.attrs.width;
      if (typeof widthAttr === "string" && widthAttr.endsWith("%")) {
        requestAnimationFrame(() => {
          const parentEl = dom.parentElement;
          if (parentEl) {
            const containerWidth = parentEl.clientWidth;
            const pctValue = parseInt(widthAttr, 10);
            if (!isNaN(pctValue) && containerWidth > 0) {
              const pxWidth = Math.round(
                containerWidth * (pctValue / 100),
              );
              frame.style.width = `${pxWidth}px`;
              if (node.attrs.aspectRatio) {
                frame.style.height = `${Math.round(pxWidth / node.attrs.aspectRatio)}px`;
              }
            }
          }
          dom.style.visibility = "";
          dom.style.pointerEvents = "";
        });
      }

      return nodeView;
    };
  },
});

function applyAlignment(container: HTMLElement, align: string) {
  if (align === "left") {
    container.style.justifyContent = "flex-start";
  } else if (align === "right") {
    container.style.justifyContent = "flex-end";
  } else {
    container.style.justifyContent = "center";
  }
}
