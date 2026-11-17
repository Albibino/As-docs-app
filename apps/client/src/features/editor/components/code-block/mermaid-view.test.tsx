import {
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NodeViewProps } from "@tiptap/react";
import { act } from "react";
import MermaidView from "./mermaid-view";

const mermaidMock = vi.hoisted(() => ({
  initialize: vi.fn(),
  render: vi.fn(),
}));

vi.mock("mermaid", () => ({ default: mermaidMock }));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

vi.mock("@mantine/core", () => {
  const ActionIcon = ({ children, ...props }: any) => (
    <button type="button" {...props}>
      {children}
    </button>
  );

  const ModalRoot = ({ children, opened, ...props }: any) =>
    opened ? (
      <div role="dialog" {...props}>
        {children}
      </div>
    ) : null;

  const Modal = Object.assign(ModalRoot, {
    Root: ModalRoot,
    Overlay: () => null,
    Content: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Header: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Title: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Body: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    CloseButton: (props: any) => <button type="button" {...props} />,
  });

  return {
    ActionIcon,
    Group: ({ children, ...props }: any) => <div {...props}>{children}</div>,
    Modal,
    Text: ({ children, ...props }: any) => <span {...props}>{children}</span>,
    Tooltip: ({ children }: any) => children,
    useComputedColorScheme: () => "light",
  };
});

function createProps(): NodeViewProps {
  return {
    node: {
      textContent: "flowchart TD\nA --> B",
    },
    editor: {
      isEditable: false,
    },
  } as NodeViewProps;
}

async function renderView() {
  render(<MermaidView props={createProps()} />);

  await waitFor(() => {
    expect(
      screen.getByRole("button", { name: "Expand Mermaid diagram" }),
    ).toBeTruthy();
  });
}

function getZoomCanvas() {
  return screen.getByTestId("mermaid-zoom-canvas");
}

function getViewerViewport() {
  return screen.getByTestId("mermaid-viewer-viewport");
}

function mockViewportRect(viewport: HTMLElement) {
  vi.spyOn(viewport, "getBoundingClientRect").mockReturnValue({
    bottom: 420,
    height: 400,
    left: 10,
    right: 510,
    top: 20,
    width: 500,
    x: 10,
    y: 20,
    toJSON: () => ({}),
  });
}

function getTransformValues() {
  const match = getZoomCanvas().style.transform.match(
    /^translate3d\(([-\d.]+)px, ([-\d.]+)px, 0\) scale\(([-\d.]+)\)$/,
  );

  expect(match).toBeTruthy();

  return {
    offsetX: Number(match?.[1]),
    offsetY: Number(match?.[2]),
    zoom: Number(match?.[3]),
  };
}

async function click(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

async function dispatch(element: HTMLElement, event: Event) {
  await act(async () => {
    fireEvent(element, event);
  });
}

function createPointerEvent(
  type: string,
  {
    button = 0,
    clientX = 0,
    clientY = 0,
    pointerId = 1,
  }: {
    button?: number;
    clientX?: number;
    clientY?: number;
    pointerId?: number;
  },
) {
  const event = new Event(type, { bubbles: true, cancelable: true });

  Object.defineProperties(event, {
    button: { value: button },
    clientX: { value: clientX },
    clientY: { value: clientY },
    pointerId: { value: pointerId },
  });

  return event;
}

describe("MermaidView", () => {
  beforeEach(() => {
    mermaidMock.initialize.mockReset();
    mermaidMock.render.mockReset();
    mermaidMock.render.mockResolvedValue({
      svg: '<svg data-testid="mermaid-svg"><path /></svg>',
    });
  });

  it("opens the diagram in a full-screen viewer", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    expect(
      screen.getByRole("dialog", { name: "Mermaid diagram preview" }),
    ).toBeTruthy();
    expect(screen.getAllByTestId("mermaid-svg")).toHaveLength(2);
  });

  it("changes zoom in 25% steps and respects the 50%-300% limits", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    const zoomIn = screen.getByRole("button", { name: "Zoom in" });
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    mockViewportRect(getViewerViewport());

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(0px, 0px, 0) scale(1)",
    );

    await click(zoomIn);
    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(-62.5px, -50px, 0) scale(1.25)",
    );

    for (let index = 0; index < 10; index += 1) {
      await click(zoomIn);
    }
    expect(getTransformValues().zoom).toBe(3);
    expect((zoomIn as HTMLButtonElement).disabled).toBe(true);

    for (let index = 0; index < 20; index += 1) {
      await click(zoomOut);
    }
    expect(getTransformValues().zoom).toBe(0.5);
    expect((zoomOut as HTMLButtonElement).disabled).toBe(true);
  });

  it("zooms around the pointer with a low-delta mouse wheel event without scrolling the viewport", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    const viewport = getViewerViewport();
    mockViewportRect(viewport);
    const wheelEvent = createEvent.wheel(viewport, {
      cancelable: true,
      clientX: 110,
      clientY: 120,
      deltaY: -1,
    });

    await dispatch(viewport, wheelEvent);

    expect(wheelEvent.defaultPrevented).toBe(true);

    const { offsetX, offsetY, zoom } = getTransformValues();

    expect(zoom).toBe(1.25);
    expect((100 - offsetX) / zoom).toBeCloseTo(100, 5);
    expect((100 - offsetY) / zoom).toBeCloseTo(100, 5);
  });

  it("limits mouse-wheel zoom between 50% and 300%", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    const viewport = getViewerViewport();
    mockViewportRect(viewport);

    for (let index = 0; index < 10; index += 1) {
      await dispatch(
        viewport,
        createEvent.wheel(viewport, {
          cancelable: true,
          clientX: 260,
          clientY: 220,
          deltaY: -1,
        }),
      );
    }
    expect(getTransformValues().zoom).toBe(3);

    for (let index = 0; index < 20; index += 1) {
      await dispatch(
        viewport,
        createEvent.wheel(viewport, {
          cancelable: true,
          clientX: 260,
          clientY: 220,
          deltaY: 1,
        }),
      );
    }
    expect(getTransformValues().zoom).toBe(0.5);
  });

  it("pans the diagram while the left mouse button is held", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    const viewport = getViewerViewport();
    const pointerDown = createPointerEvent("pointerdown", {
      button: 0,
      clientX: 100,
      clientY: 100,
      pointerId: 7,
    });

    await dispatch(viewport, pointerDown);
    await dispatch(
      viewport,
      createPointerEvent("pointermove", {
        clientX: 135,
        clientY: 145,
        pointerId: 7,
      }),
    );

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(35px, 45px, 0) scale(1)",
    );

    await dispatch(viewport, createPointerEvent("pointerup", { pointerId: 7 }));
    await dispatch(
      viewport,
      createPointerEvent("pointermove", {
        clientX: 170,
        clientY: 190,
        pointerId: 7,
      }),
    );

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(35px, 45px, 0) scale(1)",
    );
  });

  it("does not pan the diagram with the middle mouse button", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    const viewport = getViewerViewport();
    const pointerDown = createPointerEvent("pointerdown", {
      button: 1,
      clientX: 100,
      clientY: 100,
      pointerId: 8,
    });

    await dispatch(viewport, pointerDown);
    await dispatch(
      viewport,
      createPointerEvent("pointermove", {
        clientX: 135,
        clientY: 145,
        pointerId: 8,
      }),
    );

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(0px, 0px, 0) scale(1)",
    );
  });

  it("resets the view when requested and when the viewer is closed", async () => {
    await renderView();

    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));
    const viewport = getViewerViewport();
    await dispatch(
      viewport,
      createPointerEvent("pointerdown", {
        button: 0,
        clientX: 100,
        clientY: 100,
        pointerId: 9,
      }),
    );
    await dispatch(
      viewport,
      createPointerEvent("pointermove", {
        clientX: 130,
        clientY: 140,
        pointerId: 9,
      }),
    );
    await click(screen.getByRole("button", { name: "Zoom in" }));
    await click(screen.getByRole("button", { name: "Reset view" }));

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(0px, 0px, 0) scale(1)",
    );

    await click(screen.getByRole("button", { name: "Close" }));
    await click(screen.getByRole("button", { name: "Expand Mermaid diagram" }));

    expect(getZoomCanvas().style.transform).toBe(
      "translate3d(0px, 0px, 0) scale(1)",
    );
  });
});
