import type { EnemyKind, GameplayConfig, ShipStats, WeaponConfig } from '../config';
import { ARENA, OBSTACLES, PLAYER_SPAWN } from './arena';
import { circleVsObstacle, hasLineOfSight, insideArena, pointInObstacle } from './collision';
import { approach, clamp, dist, pointSegmentDist2, segmentSegmentDist2, turnTowards, wrapAngle } from './math';
import { Rng } from './rng';
import type { EndReason, InputState, Projectile, Ship, ShipKind, SimCounters, SimEvent, WorldSnapshot } from './types';

/** Fixed simulation step. The loop accumulates real (or test-controlled) time and advances in these steps. */
export const SIM_STEP = 1 / 60;

const HULL = { radius: 21, halfLength: 30 };
const AVOID_OFFSETS = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2.1, -2.1, Math.PI];
const PROBE_DISTANCES = [45, 90, 135];

/**
 * Deterministic combat simulation. Owns every continuous piece of match state; knows nothing
 * about rendering, input devices or React. Advance it only through `step`.
 */
export class World {
  readonly config: GameplayConfig;
  player: Ship;
  enemies: Ship[] = [];
  projectiles: Projectile[] = [];
  score = 0;
  time = 0;
  status: 'running' | 'ended' = 'running';
  endReason: EndReason | null = null;
  readonly counters: SimCounters = {
    spawned: { chaser: 0, shooter: 0 },
    shots: { front: 0, left: 0, right: 0, enemy: 0 },
    kills: 0,
    rams: 0,
    playerDamageTaken: 0,
  };

  private readonly rng: Rng;
  private events: SimEvent[] = [];
  private nextId = 1;
  private spawnTimer: number;
  private spawnCount = 0;
  private bumpCooldown = 0;

  constructor(config: GameplayConfig, seed: number) {
    this.config = config;
    this.rng = new Rng(seed);
    this.spawnTimer = config.spawn.firstSpawnDelaySec;
    this.player = this.createShip('player', PLAYER_SPAWN.x, PLAYER_SPAWN.y, PLAYER_SPAWN.rotation, config.player);
  }

  get timeRemaining(): number {
    return Math.max(0, this.config.sessionDurationSec - this.time);
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  step(dt: number, input: Readonly<InputState>): void {
    if (this.status !== 'running') return;

    this.time = Math.min(this.time + dt, this.config.sessionDurationSec);
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    if (this.status !== 'running') return;
    this.checkRams();
    if (this.status !== 'running') return;
    this.separateShips();
    this.enemies = this.enemies.filter((e) => e.alive);
    this.updateSpawner(dt);

    if (this.time >= this.config.sessionDurationSec) this.end('time_up');
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number, input: Readonly<InputState>): void {
    const p = this.player;
    const stats = this.config.player;
    tickCooldowns(p, dt);

    const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
    p.rotation = wrapAngle(p.rotation + turn * stats.turnRate * dt);
    const target = input.forward ? stats.maxSpeed : 0;
    p.speed = approach(p.speed, target, (input.forward ? stats.acceleration : stats.deceleration) * dt);
    this.moveShip(p, dt);

    if (input.fireFront && p.cooldowns.front <= 0) this.firePlayerFront();
    if (input.fireLeft && p.cooldowns.left <= 0) this.firePlayerBroadside('left');
    if (input.fireRight && p.cooldowns.right <= 0) this.firePlayerBroadside('right');
  }

  private firePlayerFront(): void {
    const p = this.player;
    const w = this.config.player.front;
    p.cooldowns.front = w.cooldownSec;
    const bow = p.halfLength + p.radius + 4;
    const x = p.x + Math.cos(p.rotation) * bow;
    const y = p.y + Math.sin(p.rotation) * bow;
    this.spawnProjectile('player', p.id, x, y, p.rotation, w);
    this.counters.shots.front++;
    this.events.push({ type: 'shot', weapon: 'front', x, y, angle: p.rotation });
  }

  private firePlayerBroadside(side: 'left' | 'right'): void {
    const p = this.player;
    const w = this.config.player.broadside;
    p.cooldowns[side] = w.cooldownSec;
    const angle = p.rotation + (side === 'left' ? -Math.PI / 2 : Math.PI / 2);
    const fx = Math.cos(p.rotation), fy = Math.sin(p.rotation);
    const sx = Math.cos(angle), sy = Math.sin(angle);
    const out = p.radius + 4;
    for (const k of [-1, 0, 1]) {
      const x = p.x + fx * k * w.spacing + sx * out;
      const y = p.y + fy * k * w.spacing + sy * out;
      this.spawnProjectile('player', p.id, x, y, angle, w);
    }
    this.counters.shots[side]++;
    this.events.push({ type: 'shot', weapon: side, x: p.x + sx * out, y: p.y + sy * out, angle });
  }

  // ---------------------------------------------------------------- enemies

  private updateEnemies(dt: number): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      tickCooldowns(e, dt);
      const stats = e.kind === 'chaser' ? this.config.chaser : this.config.shooter;
      const toPlayer = Math.atan2(p.y - e.y, p.x - e.x);
      const distance = dist(e.x, e.y, p.x, p.y);

      let targetSpeed = stats.maxSpeed;
      if (e.kind === 'shooter') {
        const range = this.config.shooter.attackRange;
        // Close in until comfortably inside the attack range, then hold position and aim.
        if (distance < range * 0.8) targetSpeed = stats.maxSpeed * 0.15;
        else if (distance < range) targetSpeed = stats.maxSpeed * 0.5;
      }

      const heading = this.steer(e, toPlayer);
      e.rotation = turnTowards(e.rotation, heading, stats.turnRate * dt);
      e.speed = approach(e.speed, targetSpeed, (e.speed < targetSpeed ? stats.acceleration : stats.deceleration) * dt);
      this.moveShip(e, dt);

      if (e.kind === 'shooter') this.tryShooterFire(e, distance);
    }
  }

  /** Picks the heading closest to `desired` whose short look-ahead path is free of obstacles. */
  private steer(e: Ship, desired: number): number {
    const pad = e.radius + 8;
    for (const offset of AVOID_OFFSETS) {
      const heading = desired + offset;
      const cx = Math.cos(heading), cy = Math.sin(heading);
      let clear = true;
      for (const d of PROBE_DISTANCES) {
        const px = e.x + cx * (d + e.halfLength);
        const py = e.y + cy * (d + e.halfLength);
        if (pointInObstacle(px, py, pad) || !insideArena(px, py, 10)) {
          clear = false;
          break;
        }
      }
      if (clear) return heading;
    }
    return desired;
  }

  private tryShooterFire(e: Ship, distance: number): void {
    const cfg = this.config.shooter;
    if (e.cooldowns.front > 0 || distance > cfg.attackRange || !this.player.alive) return;
    const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    if (Math.abs(wrapAngle(aim - e.rotation)) > cfg.aimTolerance) return;
    const bow = e.halfLength + e.radius + 4;
    const x = e.x + Math.cos(e.rotation) * bow;
    const y = e.y + Math.sin(e.rotation) * bow;
    if (!hasLineOfSight(x, y, this.player.x, this.player.y)) return;
    e.cooldowns.front = cfg.weapon.cooldownSec;
    this.spawnProjectile('enemy', e.id, x, y, aim, cfg.weapon);
    this.counters.shots.enemy++;
    this.events.push({ type: 'shot', weapon: 'enemy', x, y, angle: aim });
  }

  private checkRams(): void {
    const p = this.player;
    for (const e of this.enemies) {
      if (!e.alive || e.kind !== 'chaser') continue;
      if (!capsulesOverlap(p, e, 0)) continue;
      e.alive = false;
      this.counters.rams++;
      this.events.push({ type: 'destroyed', shipId: e.id, kind: e.kind, x: e.x, y: e.y, rotation: e.rotation, cause: 'ram' });
      this.events.push({ type: 'rammed', shipId: e.id, x: e.x, y: e.y, damage: this.config.chaser.ramDamage });
      this.damagePlayer(this.config.chaser.ramDamage, 'ram');
      if (this.status !== 'running') return;
    }
  }

  /** Keeps ships from overlapping each other (no damage; chaser contact is handled by checkRams). */
  private separateShips(): void {
    const ships = [this.player, ...this.enemies.filter((e) => e.alive)];
    for (let i = 0; i < ships.length; i++) {
      for (let j = i + 1; j < ships.length; j++) {
        const a = ships[i], b = ships[j];
        const minD = a.radius + b.radius + 6;
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d < 1e-6) continue;
        const overlap = minD - d;
        const nx = dx / d, ny = dy / d;
        // The player is never shoved by enemies; enemies share the correction.
        const share = a.kind === 'player' ? 0 : 0.5;
        a.x -= nx * overlap * share; a.y -= ny * overlap * share;
        b.x += nx * overlap * (1 - share); b.y += ny * overlap * (1 - share);
        this.resolveStatic(a);
        this.resolveStatic(b);
      }
    }
  }

  // ---------------------------------------------------------------- projectiles

  private spawnProjectile(owner: 'player' | 'enemy', ownerId: number, x: number, y: number, angle: number, w: WeaponConfig): void {
    this.projectiles.push({
      id: this.nextId++,
      owner,
      ownerId,
      x,
      y,
      vx: Math.cos(angle) * w.projectileSpeed,
      vy: Math.sin(angle) * w.projectileSpeed,
      damage: w.damage,
      traveled: 0,
      range: w.range,
      age: 0,
      lifetime: w.lifetimeSec,
    });
  }

  private updateProjectiles(dt: number): void {
    const r = this.config.projectileRadius;
    const survivors: Projectile[] = [];
    for (const pr of this.projectiles) {
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.age += dt;
      pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;

      if (!insideArena(pr.x, pr.y)) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'bounds' });
        continue;
      }
      if (pointInObstacle(pr.x, pr.y, r)) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'island' });
        continue;
      }
      if (this.resolveProjectileHit(pr, r)) {
        if (this.status !== 'running') return;
        continue;
      }
      if (pr.traveled >= pr.range || pr.age >= pr.lifetime) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'range' });
        continue;
      }
      survivors.push(pr);
    }
    this.projectiles = survivors;
  }

  /** Applies the projectile's damage to at most one target. Returns true when it hit (and is consumed). */
  private resolveProjectileHit(pr: Projectile, r: number): boolean {
    if (pr.owner === 'enemy') {
      const p = this.player;
      if (!p.alive || !pointHitsShip(pr.x, pr.y, r, p)) return false;
      this.events.push({ type: 'hit', shipId: p.id, x: pr.x, y: pr.y, damage: pr.damage });
      this.damagePlayer(pr.damage, 'enemy-fire');
      return true;
    }
    for (const e of this.enemies) {
      if (!e.alive || !pointHitsShip(pr.x, pr.y, r, e)) continue;
      e.health = Math.max(0, e.health - pr.damage);
      this.events.push({ type: 'hit', shipId: e.id, x: pr.x, y: pr.y, damage: pr.damage });
      if (e.health <= 0) {
        e.alive = false;
        this.score += 1;
        this.counters.kills++;
        this.events.push({ type: 'destroyed', shipId: e.id, kind: e.kind, x: e.x, y: e.y, rotation: e.rotation, cause: 'player-fire' });
        this.events.push({ type: 'score', score: this.score });
      }
      return true;
    }
    return false;
  }

  private damagePlayer(amount: number, cause: 'ram' | 'enemy-fire'): void {
    const p = this.player;
    p.health = Math.max(0, p.health - amount);
    this.counters.playerDamageTaken += amount;
    if (p.health <= 0) {
      p.alive = false;
      this.events.push({ type: 'destroyed', shipId: p.id, kind: 'player', x: p.x, y: p.y, rotation: p.rotation, cause });
      this.end('destroyed');
    }
  }

  // ---------------------------------------------------------------- spawning

  private updateSpawner(dt: number): void {
    const cfg = this.config.spawn;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    if (this.enemies.length >= cfg.maxAlive) {
      this.spawnTimer += cfg.intervalSec;
      return;
    }
    const kind: EnemyKind = this.spawnCount < cfg.openingSequence.length
      ? cfg.openingSequence[this.spawnCount]
      : this.rng.pickWeighted(cfg.weights);
    const pos = this.findSpawnPoint();
    if (!pos) {
      // Every candidate was blocked or too close to the player; retry shortly instead of skipping.
      this.spawnTimer = 0.25;
      return;
    }
    this.spawnTimer += cfg.intervalSec;
    this.spawnEnemy(kind, pos.x, pos.y, Math.atan2(this.player.y - pos.y, this.player.x - pos.x));
  }

  private findSpawnPoint(): { x: number; y: number } | null {
    const cfg = this.config.spawn;
    const m = cfg.edgeMargin;
    for (let i = 0; i < cfg.attempts; i++) {
      const side = this.rng.int(4);
      const along = this.rng.next();
      const x = side === 0 ? m + along * (ARENA.width - 2 * m) : side === 1 ? ARENA.width - m : side === 2 ? m + along * (ARENA.width - 2 * m) : m;
      const y = side === 0 ? m : side === 1 ? m + along * (ARENA.height - 2 * m) : side === 2 ? ARENA.height - m : m + along * (ARENA.height - 2 * m);
      if (dist(x, y, this.player.x, this.player.y) < cfg.minDistanceFromPlayer) continue;
      if (pointInObstacle(x, y, HULL.halfLength + HULL.radius + 12)) continue;
      if (this.enemies.some((e) => e.alive && dist(x, y, e.x, e.y) < 110)) continue;
      return { x, y };
    }
    return null;
  }

  /** Adds an enemy. Used by the spawner and by the test instrumentation to arrange scenarios. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, rotation: number): Ship {
    const e = this.createShip(kind, x, y, rotation, kind === 'chaser' ? this.config.chaser : this.config.shooter);
    e.speed = 0;
    this.enemies.push(e);
    this.spawnCount++;
    this.counters.spawned[kind]++;
    this.events.push({ type: 'spawn', shipId: e.id, kind });
    return e;
  }

  // ---------------------------------------------------------------- movement & collisions

  private moveShip(s: Ship, dt: number): void {
    s.x += Math.cos(s.rotation) * s.speed * dt;
    s.y += Math.sin(s.rotation) * s.speed * dt;
    if (this.resolveStatic(s) && s.kind === 'player') {
      s.speed *= 0.6;
      if (this.bumpCooldown <= 0) {
        this.bumpCooldown = 0.6;
        this.events.push({ type: 'bump', x: s.x, y: s.y });
      }
    }
  }

  /** Pushes the ship's capsule out of islands and back inside the arena. Returns true on contact. */
  private resolveStatic(s: Ship): boolean {
    let touched = false;
    for (let iter = 0; iter < 3; iter++) {
      let moved = false;
      const cx = Math.cos(s.rotation), cy = Math.sin(s.rotation);
      for (const k of [-1, 0, 1]) {
        const px = s.x + cx * k * s.halfLength;
        const py = s.y + cy * k * s.halfLength;
        for (const o of OBSTACLES) {
          const push = circleVsObstacle(px, py, s.radius, o);
          if (!push) continue;
          s.x += push.nx * push.depth;
          s.y += push.ny * push.depth;
          moved = touched = true;
        }
        // Arena bounds, applied to each capsule sample so the bow and stern stay visible.
        const qx = s.x + cx * k * s.halfLength;
        const qy = s.y + cy * k * s.halfLength;
        const bx = clamp(qx, s.radius, ARENA.width - s.radius);
        const by = clamp(qy, s.radius, ARENA.height - s.radius);
        if (bx !== qx || by !== qy) {
          s.x += bx - qx;
          s.y += by - qy;
          moved = touched = true;
        }
      }
      if (!moved) break;
    }
    return touched;
  }

  private createShip(kind: ShipKind, x: number, y: number, rotation: number, stats: ShipStats): Ship {
    return {
      id: this.nextId++,
      kind,
      x,
      y,
      rotation,
      speed: 0,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      alive: true,
      radius: HULL.radius,
      halfLength: HULL.halfLength,
      cooldowns: { front: 0, left: 0, right: 0 },
    };
  }

  private end(reason: EndReason): void {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endReason = reason;
    this.projectiles = [];
    this.events.push({ type: 'ended', reason });
  }

  snapshot(): WorldSnapshot {
    const p = this.player;
    return {
      status: this.status,
      endReason: this.endReason,
      timeSec: this.time,
      timeRemainingSec: this.timeRemaining,
      score: this.score,
      player: { x: p.x, y: p.y, rotation: p.rotation, speed: p.speed, health: p.health, maxHealth: p.maxHealth, cooldowns: { ...p.cooldowns } },
      enemies: this.enemies.filter((e) => e.alive).map((e) => ({
        id: e.id, kind: e.kind as EnemyKind, x: e.x, y: e.y, rotation: e.rotation, speed: e.speed, health: e.health, maxHealth: e.maxHealth,
      })),
      projectiles: this.projectiles.map((pr) => ({ id: pr.id, owner: pr.owner, x: pr.x, y: pr.y })),
      counters: structuredClone(this.counters),
      nextSpawnInSec: Math.max(0, this.spawnTimer),
    };
  }
}

function tickCooldowns(s: Ship, dt: number): void {
  s.cooldowns.front = Math.max(0, s.cooldowns.front - dt);
  s.cooldowns.left = Math.max(0, s.cooldowns.left - dt);
  s.cooldowns.right = Math.max(0, s.cooldowns.right - dt);
}

function capsuleEnds(s: Ship): [number, number, number, number] {
  const cx = Math.cos(s.rotation) * s.halfLength;
  const cy = Math.sin(s.rotation) * s.halfLength;
  return [s.x - cx, s.y - cy, s.x + cx, s.y + cy];
}

function capsulesOverlap(a: Ship, b: Ship, slack: number): boolean {
  const [a1x, a1y, a2x, a2y] = capsuleEnds(a);
  const [b1x, b1y, b2x, b2y] = capsuleEnds(b);
  const r = a.radius + b.radius + slack;
  return segmentSegmentDist2(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) <= r * r;
}

function pointHitsShip(x: number, y: number, r: number, s: Ship): boolean {
  const [ax, ay, bx, by] = capsuleEnds(s);
  const reach = s.radius + r;
  return pointSegmentDist2(x, y, ax, ay, bx, by) <= reach * reach;
}
