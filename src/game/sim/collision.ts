import { ARENA, OBSTACLES, type Obstacle } from './arena';
import { clamp } from './math';

export interface Push {
  nx: number;
  ny: number;
  depth: number;
}

/** Circle vs rounded rectangle: returns the separating push, or null when not overlapping. */
export function circleVsObstacle(cx: number, cy: number, cr: number, o: Obstacle): Push | null {
  const ix = o.x + o.radius;
  const iy = o.y + o.radius;
  const iw = o.w - o.radius * 2;
  const ih = o.h - o.radius * 2;
  const px = clamp(cx, ix, ix + iw);
  const py = clamp(cy, iy, iy + ih);
  const dx = cx - px;
  const dy = cy - py;
  const reach = cr + o.radius;
  const d2 = dx * dx + dy * dy;
  if (d2 >= reach * reach) return null;
  const d = Math.sqrt(d2);
  if (d > 1e-6) return { nx: dx / d, ny: dy / d, depth: reach - d };
  // Center inside the inner rectangle: push out along the axis of least penetration.
  const left = cx - ix, right = ix + iw - cx, top = cy - iy, bottom = iy + ih - cy;
  const m = Math.min(left, right, top, bottom);
  if (m === left) return { nx: -1, ny: 0, depth: left + reach };
  if (m === right) return { nx: 1, ny: 0, depth: right + reach };
  if (m === top) return { nx: 0, ny: -1, depth: top + reach };
  return { nx: 0, ny: 1, depth: bottom + reach };
}

export function pointInObstacle(x: number, y: number, pad: number, obstacles: readonly Obstacle[] = OBSTACLES): boolean {
  for (const o of obstacles) {
    if (circleVsObstacle(x, y, pad, o)) return true;
  }
  return false;
}

export function insideArena(x: number, y: number, margin = 0): boolean {
  return x >= margin && y >= margin && x <= ARENA.width - margin && y <= ARENA.height - margin;
}

/** True when the straight segment A→B does not cross any obstacle (sampled every `step` units). */
export function hasLineOfSight(ax: number, ay: number, bx: number, by: number, pad = 4, step = 16): boolean {
  const len = Math.hypot(bx - ax, by - ay);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 1; i < n; i++) {
    const t = i / n;
    if (pointInObstacle(ax + (bx - ax) * t, ay + (by - ay) * t, pad)) return false;
  }
  return true;
}
