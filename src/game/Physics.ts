import { Vector2D, IslandEntity } from '@/types/game.types';

export class Physics {
  /**
   * Distance between two points
   */
  static distance(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Distance squared (fast check)
   */
  static distanceSq(x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return dx * dx + dy * dy;
  }

  /**
   * Normalizes an angle to [-PI, PI]
   */
  static normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }

  /**
   * Circle vs Circle collision
   */
  static circleIntersects(
    x1: number, y1: number, r1: number,
    x2: number, y2: number, r2: number
  ): boolean {
    const minDistance = r1 + r2;
    return this.distanceSq(x1, y1, x2, y2) < minDistance * minDistance;
  }

  /**
   * Resolves collision of a ship against solid islands
   * Pushes the ship smoothly out of the island radius
   */
  static resolveIslandCollisions(
    shipX: number,
    shipY: number,
    shipRadius: number,
    islands: IslandEntity[]
  ): { x: number; y: number; collided: boolean } {
    let newX = shipX;
    let newY = shipY;
    let collided = false;

    for (const island of islands) {
      const dist = this.distance(newX, newY, island.x, island.y);
      const minDistance = island.radius + shipRadius;

      if (dist < minDistance && dist > 0.001) {
        collided = true;
        // Normal vector pointing away from island center
        const nx = (newX - island.x) / dist;
        const ny = (newY - island.y) / dist;

        // Push outside
        newX = island.x + nx * minDistance;
        newY = island.y + ny * minDistance;
      }
    }

    return { x: newX, y: newY, collided };
  }

  /**
   * Checks if a line segment between (x1, y1) and (x2, y2) intersects any island
   */
  static hasLineOfSight(
    x1: number, y1: number,
    x2: number, y2: number,
    islands: IslandEntity[]
  ): boolean {
    for (const island of islands) {
      // Distance from point to line segment
      const dist = this.distPointToSegment(island.x, island.y, x1, y1, x2, y2);
      if (dist < island.radius + 10) {
        return false; // Island blocks line of sight
      }
    }
    return true;
  }

  /**
   * Distance from a point (px, py) to segment (x1, y1)-(x2, y2)
   */
  private static distPointToSegment(
    px: number, py: number,
    x1: number, y1: number,
    x2: number, y2: number
  ): number {
    const l2 = this.distanceSq(x1, y1, x2, y2);
    if (l2 === 0) return this.distance(px, py, x1, y1);
    let t = ((px - x1) * (x2 - x1) + (py - y1) * (y2 - y1)) / l2;
    t = Math.max(0, Math.min(1, t));
    return this.distance(px, py, x1 + t * (x2 - x1), y1 + t * (y2 - y1));
  }

  /**
   * Steering behavior for AI navigation around islands
   */
  static getAvoidanceVector(
    x: number, y: number,
    vx: number, vy: number,
    islands: IslandEntity[],
    lookAhead: number = 180
  ): Vector2D {
    let avoidX = 0;
    let avoidY = 0;

    for (const island of islands) {
      const dist = this.distance(x, y, island.x, island.y);
      const detectionRange = island.radius + lookAhead;

      if (dist < detectionRange) {
        const toIslandX = island.x - x;
        const toIslandY = island.y - y;

        // Dot product to check if island is in front
        const forwardDot = toIslandX * vx + toIslandY * vy;
        if (forwardDot > 0) {
          // Repulsion force
          const force = (detectionRange - dist) / detectionRange;
          avoidX -= (toIslandX / dist) * force * 2.5;
          avoidY -= (toIslandY / dist) * force * 2.5;
        }
      }
    }

    return { x: avoidX, y: avoidY };
  }
}
