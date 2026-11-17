type CircleNode = {
  id: string;
  x: number;
  y: number;
  radius: number;
  fixed: boolean;
};

type CollisionBounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
};

/** Mutates circle positions until rendered nodes no longer overlap. */
export function resolveCircleCollisions<T extends CircleNode>(
  nodes: T[],
  bounds: CollisionBounds,
  padding: number,
  passes = 2,
) {
  const largestRadius = nodes.reduce(
    (largest, node) => Math.max(largest, node.radius),
    0,
  );
  const cellSize = Math.max(largestRadius * 2 + padding, 1);

  for (let pass = 0; pass < passes; pass += 1) {
    const grid = new Map<string, number[]>();
    for (const [index, node] of nodes.entries()) {
      const key = cellKey(node.x, node.y, cellSize);
      const bucket = grid.get(key);
      if (bucket) bucket.push(index);
      else grid.set(key, [index]);
    }

    for (let leftIndex = 0; leftIndex < nodes.length; leftIndex += 1) {
      const left = nodes[leftIndex];
      const cellX = Math.floor(left.x / cellSize);
      const cellY = Math.floor(left.y / cellSize);
      for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
        for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
          const bucket = grid.get(`${cellX + offsetX},${cellY + offsetY}`);
          if (!bucket) continue;
          for (const rightIndex of bucket) {
            if (rightIndex <= leftIndex) continue;
            separatePair(left, nodes[rightIndex], bounds, padding);
          }
        }
      }
    }
  }
}

function separatePair(
  left: CircleNode,
  right: CircleNode,
  bounds: CollisionBounds,
  padding: number,
) {
  const dx = right.x - left.x;
  const dy = right.y - left.y;
  const distance = Math.hypot(dx, dy);
  const minimum = left.radius + right.radius + padding;
  if (distance >= minimum || (left.fixed && right.fixed)) return;

  let nx: number;
  let ny: number;
  if (distance < 1e-6) {
    const angle = seededValue(`${left.id}:${right.id}`) * Math.PI * 2;
    nx = Math.cos(angle);
    ny = Math.sin(angle);
  } else {
    nx = dx / distance;
    ny = dy / distance;
  }

  const overlap = minimum - distance;
  const leftShare = right.fixed ? 1 : left.fixed ? 0 : 0.5;
  const rightShare = left.fixed ? 1 : right.fixed ? 0 : 0.5;

  if (!left.fixed) {
    left.x = clamp(left.x - nx * overlap * leftShare, bounds.minX, bounds.maxX);
    left.y = clamp(left.y - ny * overlap * leftShare, bounds.minY, bounds.maxY);
  }
  if (!right.fixed) {
    right.x = clamp(
      right.x + nx * overlap * rightShare,
      bounds.minX,
      bounds.maxX,
    );
    right.y = clamp(
      right.y + ny * overlap * rightShare,
      bounds.minY,
      bounds.maxY,
    );
  }
}

function cellKey(x: number, y: number, cellSize: number) {
  return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
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
