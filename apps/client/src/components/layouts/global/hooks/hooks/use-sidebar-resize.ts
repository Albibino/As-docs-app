import { useCallback, useEffect, useState, type RefObject } from "react";
import { useAtom, type WritableAtom } from "jotai";
import {
  SIDEBAR_COLLAPSED_WIDTH,
  SIDEBAR_COLLAPSE_THRESHOLD,
} from "@/components/layouts/global/hooks/atoms/sidebar-atom.ts";

type SidebarResizeOptions = {
  minWidth: number;
  maxWidth: number;
};

export function useSidebarResize(
  widthAtom: WritableAtom<number, [number], void>,
  collapsedAtom: WritableAtom<boolean, [boolean], void>,
  containerRef: RefObject<HTMLElement>,
  { minWidth, maxWidth }: SidebarResizeOptions,
) {
  const [width, setWidth] = useAtom(widthAtom);
  const [collapsed, setCollapsed] = useAtom(collapsedAtom);
  const [isResizing, setIsResizing] = useState(false);

  // Pointer capture guarantees pointerup/pointermove keep reaching the
  // handle even if the cursor leaves the window mid-drag. Plain mouse
  // listeners on window miss the mouseup in that case, leaving isResizing
  // stuck true so every later mouse movement anywhere on the page keeps
  // resizing the sidebar.
  const startResizing = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Capture is best-effort — a handful of browsers/input types reject
      // it, but resizing still works via the window-level fallback below.
    }
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    try {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
    } catch {
      // ignore
    }
    setIsResizing(false);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed(!collapsed);
  }, [collapsed, setCollapsed]);

  const resize = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing || !containerRef.current) return;
      const newWidth =
        e.clientX - containerRef.current.getBoundingClientRect().left;

      if (newWidth <= SIDEBAR_COLLAPSE_THRESHOLD) {
        setCollapsed(true);
        return;
      }

      setCollapsed(false);
      setWidth(Math.min(maxWidth, Math.max(minWidth, newWidth)));
    },
    [isResizing, containerRef, minWidth, maxWidth, setWidth, setCollapsed],
  );

  // Fallback for browsers/inputs where pointer capture silently fails
  // (see startResizing): track the drag via window-level listeners too, and
  // always release on blur so isResizing can never get stuck true.
  useEffect(() => {
    if (!isResizing) return;
    const stop = () => setIsResizing(false);
    const move = (e: PointerEvent) => resize(e as unknown as React.PointerEvent<HTMLDivElement>);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
    };
  }, [isResizing, resize]);

  return {
    width: collapsed ? SIDEBAR_COLLAPSED_WIDTH : width,
    collapsed,
    isResizing,
    startResizing,
    stopResizing,
    resize,
    toggleCollapsed,
  };
}
