import { describe, expect, it } from "vitest";
import { resolveCircleCollisions } from "./graph-collision";

const bounds = { minX: -100, maxX: 100, minY: -100, maxY: 100 };

describe("resolveCircleCollisions", () => {
  it("separates coincident circles using their radii and padding", () => {
    const nodes = [
      { id: "large", x: 0, y: 0, radius: 11, fixed: false },
      { id: "small", x: 0, y: 0, radius: 4.5, fixed: false },
    ];

    resolveCircleCollisions(nodes, bounds, 1.5);

    expect(
      Math.hypot(nodes[0].x - nodes[1].x, nodes[0].y - nodes[1].y),
    ).toBeGreaterThanOrEqual(17);
  });

  it("moves only free circle when other circle is being dragged", () => {
    const nodes = [
      { id: "fixed", x: 0, y: 0, radius: 10, fixed: true },
      { id: "free", x: 5, y: 0, radius: 10, fixed: false },
    ];

    resolveCircleCollisions(nodes, bounds, 2);

    expect(nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(nodes[1]).toMatchObject({ x: 22, y: 0 });
  });
});
