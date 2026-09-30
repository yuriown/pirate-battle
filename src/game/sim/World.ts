import type { EnemyKind, GameplayConfig, ShipStats, WeaponConfig } from '../config';
import { ARENA, OBSTACLES, PLAYER_SPAWN } from './arena';
import { circleVsObstacle, hasLineOfSight, insideArena, pointInObstacle } from './collision';
import { approach, clamp, dist2, pointSegmentDist2, segmentSegmentDist2, turnTowards, wrapAngle } from './math';
import { Rng } from './rng';
import type { EndReason, InputState, Projectile, Ship, ShipKind, SimCounters, SimEvent, WorldSnapshot } from './types';

/** Fixed simulation step. The loop accumulates real (or test-controlled) time and advances in these steps. */
export const SIM_STEP = 1 / 60;

const HULL = { radius: 21, halfLength: 30 };
const PROBE_DISTANCES = [45, 90, 135];
const AVOID_STEP = 0.35;
const AVOID_STEPS = 9;
/** How long an enemy keeps its chosen detour side after the direct path clears (prevents dithering). */
const AVOID_MEMORY_SEC = 1;

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
  private eventsA: SimEvent[] = [];
  private eventsB: SimEvent[] = [];
  private events = this.eventsA;
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
    this.events = out === this.eventsA ? this.eventsB : this.eventsA;
    this.events.length = 0;
    return out;
  }

  step(dt: number, input: Readonly<InputState>): void {
    if (this.status !== 'running') return;

    const duration = this.config.sessionDurationSec;
    // Snap to the duration so float accumulation (60 × 1/60 ≠ 1) cannot postpone the end by a step.
    this.time = duration - (this.time + dt) < 1e-6 ? duration : this.time + dt;
    this.bumpCooldown = Math.max(0, this.bumpCooldown - dt);
    this.storePreviousPoses();

    this.updatePlayer(dt, input);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    // Death wins over time-up when both happen in the same step.
    if (this.status !== 'running') return;
    this.checkRams();
    if (this.status !== 'running') return;
    this.separateShips();
    this.removeDeadEnemies();
    if (this.time >= duration) {
      this.end('time_up');
      return;
    }
    this.updateSpawner(dt);
  }

  private removeDeadEnemies(): void {
    const enemies = this.enemies;
    let write = 0;
    for (let read = 0; read < enemies.length; read++) {
      const e = enemies[read];
      if (e.alive) {
        enemies[write++] = e;
      }
    }
    enemies.length = write;
  }

  private storePreviousPoses(): void {
    const p = this.player;
    p.prevX = p.x;
    p.prevY = p.y;
    p.prevRotation = p.rotation;

    const enemies = this.enemies;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      e.prevX = e.x;
      e.prevY = e.y;
      e.prevRotation = e.rotation;
    }

    const projs = this.projectiles;
    for (let i = 0; i < projs.length; i++) {
      const pr = projs[i];
      pr.prevX = pr.x;
      pr.prevY = pr.y;
    }
  }

  // ---------------------------------------------------------------- player

  private updatePlayer(dt: number, input: Readonly<InputState>): void {
    const p = this.player;
    const stats = this.config.player;
    tickCooldowns(p, dt);

    if (input.steer !== null) {
      p.rotation = wrapAngle(turnTowards(p.rotation, input.steer, stats.turnRate * dt));
    } else {
      const turn = (input.turnRight ? 1 : 0) - (input.turnLeft ? 1 : 0);
      p.rotation = wrapAngle(p.rotation + turn * stats.turnRate * dt);
    }
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
    this.spawnProjectile('player', x, y, p.rotation, w);
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
    for (let k = -1; k <= 1; k++) {
      const x = p.x + fx * k * w.spacing + sx * out;
      const y = p.y + fy * k * w.spacing + sy * out;
      this.spawnProjectile('player', x, y, angle, w);
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

      let targetSpeed = stats.maxSpeed;
      let holding = false;
      let d2 = 0;
      if (e.kind === 'shooter') {
        const range = this.config.shooter.attackRange;
        const range2 = range * range;
        d2 = dist2(e.x, e.y, p.x, p.y);
        // Close in until comfortably inside the attack range, then hold position and aim —
        // but only with a clear line of fire; behind an island it keeps manoeuvring.
        if (d2 < range2 && hasLineOfSight(e.x, e.y, p.x, p.y)) {
          const holdRange = range * 0.75;
          holding = d2 < holdRange * holdRange;
          targetSpeed = holding ? 0 : stats.maxSpeed * 0.4;
        }
      }

      // A shooter holding position aims straight at the player; moving ships steer around islands.
      const heading = holding ? toPlayer : this.steer(e, toPlayer, dt);
      // Bow blocked: slow down so the turn can happen instead of grinding along the shore.
      if (!this.pathClear(e, e.rotation)) targetSpeed = Math.min(targetSpeed, stats.maxSpeed * 0.45);
      e.rotation = turnTowards(e.rotation, heading, stats.turnRate * dt);
      e.speed = approach(e.speed, targetSpeed, (e.speed < targetSpeed ? stats.acceleration : stats.deceleration) * dt);
      this.moveShip(e, dt);

      if (e.kind === 'shooter') this.tryShooterFire(e, d2);
    }
  }

  /**
   * Obstacle avoidance: go straight when the look-ahead path is free, otherwise take the
   * nearest free heading on one side and keep that side for a while, so an enemy facing an
   * island commits to going around it instead of alternating left/right against the shore.
   */
  private steer(e: Ship, desired: number, dt: number): number {
    if (this.pathClear(e, desired)) {
      e.avoidTimer = Math.max(0, e.avoidTimer - dt);
      if (e.avoidTimer === 0) e.avoidSide = 0;
      if (e.avoidSide === 0) return desired;
    }
    if (e.avoidSide === 0) e.avoidSide = this.freeSteps(e, desired, 1) <= this.freeSteps(e, desired, -1) ? 1 : -1;
    e.avoidTimer = AVOID_MEMORY_SEC;
    const side1 = e.avoidSide;
    const side2 = -e.avoidSide;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? side1 : side2;
      const k = this.freeSteps(e, desired, side);
      if (k <= AVOID_STEPS) {
        e.avoidSide = side;
        return desired + side * k * AVOID_STEP;
      }
    }
    return desired + e.avoidSide * (Math.PI / 2);
  }

  /** Number of AVOID_STEP increments towards `side` until the path is clear (AVOID_STEPS + 1 if never). */
  private freeSteps(e: Ship, desired: number, side: number): number {
    for (let k = e.avoidSide === 0 ? 1 : 0; k <= AVOID_STEPS; k++) {
      if (this.pathClear(e, desired + side * k * AVOID_STEP)) return k;
    }
    return AVOID_STEPS + 1;
  }

  private pathClear(e: Ship, heading: number): boolean {
    const pad = e.radius + 8;
    const cx = Math.cos(heading), cy = Math.sin(heading);
    for (const d of PROBE_DISTANCES) {
      const px = e.x + cx * (d + e.halfLength);
      const py = e.y + cy * (d + e.halfLength);
      if (pointInObstacle(px, py, pad) || !insideArena(px, py, 10)) return false;
    }
    return true;
  }

  private tryShooterFire(e: Ship, d2: number): void {
    const cfg = this.config.shooter;
    if (e.cooldowns.front > 0 || d2 > cfg.attackRange * cfg.attackRange || !this.player.alive) return;
    const aim = Math.atan2(this.player.y - e.y, this.player.x - e.x);
    if (Math.abs(wrapAngle(aim - e.rotation)) > cfg.aimTolerance) return;
    const bow = e.halfLength + e.radius + 4;
    const x = e.x + Math.cos(e.rotation) * bow;
    const y = e.y + Math.sin(e.rotation) * bow;
    // Same radius as the cannonball, so a shot that would clip an island corner is not fired.
    if (!hasLineOfSight(x, y, this.player.x, this.player.y, this.config.projectileRadius)) return;
    e.cooldowns.front = cfg.weapon.cooldownSec;
    this.spawnProjectile('enemy', x, y, aim, cfg.weapon);
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

  /**
   * Keeps hulls from overlapping each other (no damage; chaser contact is handled by checkRams).
   * Uses three capsule samples per ship, so long hulls separate too.
   */
  private separateShips(): void {
    const p = this.player;
    const enemies = this.enemies;
    const len = enemies.length;

    // Player vs shooters (chaser touching player is a ram handled by checkRams)
    for (let i = 0; i < len; i++) {
      const e = enemies[i];
      if (e.alive && e.kind !== 'chaser') {
        this.separatePair(p, e);
      }
    }

    // Enemy vs enemy
    for (let i = 0; i < len; i++) {
      const a = enemies[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < len; j++) {
        const b = enemies[j];
        if (!b.alive) continue;
        this.separatePair(a, b);
      }
    }
  }

  private separatePair(a: Ship, b: Ship): void {
    const maxD = (a.halfLength + a.radius) + (b.halfLength + b.radius);
    if (dist2(a.x, a.y, b.x, b.y) > maxD * maxD) return;

    const minD = a.radius + b.radius + 4;
    const acx = Math.cos(a.rotation) * a.halfLength;
    const acy = Math.sin(a.rotation) * a.halfLength;
    const bcx = Math.cos(b.rotation) * b.halfLength;
    const bcy = Math.sin(b.rotation) * b.halfLength;

    for (let ak = -1; ak <= 1; ak++) {
      const ax = a.x + acx * ak;
      const ay = a.y + acy * ak;
      for (let bk = -1; bk <= 1; bk++) {
        const bx = b.x + bcx * bk;
        const by = b.y + bcy * bk;
        const dx = bx - ax, dy = by - ay;
        const d = Math.hypot(dx, dy);
        if (d >= minD || d < 1e-6) continue;
        const overlap = minD - d;
        const nx = dx / d, ny = dy / d;
        // The player is never shoved by enemies; enemies share the correction.
        const share = a.kind === 'player' ? 0 : 0.5;
        a.x -= nx * overlap * share; a.y -= ny * overlap * share;
        b.x += nx * overlap * (1 - share); b.y += ny * overlap * (1 - share);
      }
    }
    this.resolveStatic(a);
    this.resolveStatic(b);
  }

  // ---------------------------------------------------------------- projectiles

  private spawnProjectile(owner: 'player' | 'enemy', x: number, y: number, angle: number, w: WeaponConfig): void {
    this.projectiles.push({
      id: this.nextId++,
      owner,
      x,
      y,
      prevX: x,
      prevY: y,
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
    const projs = this.projectiles;

    for (let i = 0; i < projs.length; i++) {
      const pr = projs[i];
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.age += dt;
      pr.traveled += Math.hypot(pr.vx, pr.vy) * dt;

      let isDead = false;

      if (!insideArena(pr.x, pr.y)) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'bounds' });
        isDead = true;
      } else if (pointInObstacle(pr.x, pr.y, r)) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'island' });
        isDead = true;
      } else if (this.resolveProjectileHit(pr, r)) {
        if (this.status !== 'running') return;
        isDead = true;
      } else if (pr.traveled >= pr.range || pr.age >= pr.lifetime) {
        this.events.push({ type: 'projectile-expired', x: pr.x, y: pr.y, reason: 'range' });
        isDead = true;
      }

      if (isDead) {
        // O(1) in-place swap-and-pop: overwrite with the last element and shrink the array.
        const last = projs.length - 1;
        projs[i] = projs[last];
        projs.length = last;
        i--;
      }
    }
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
      // Arena full: the due spawn happens as soon as a slot frees up.
      this.spawnTimer = 0.25;
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
      if (dist2(x, y, this.player.x, this.player.y) < cfg.minDistanceFromPlayer * cfg.minDistanceFromPlayer) continue;
      if (pointInObstacle(x, y, HULL.halfLength + HULL.radius + 12)) continue;
      if (this.enemies.some((e) => e.alive && dist2(x, y, e.x, e.y) < 110 * 110)) continue;
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
      for (let k = -1; k <= 1; k++) {
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
      prevX: x,
      prevY: y,
      prevRotation: rotation,
      speed: 0,
      health: stats.maxHealth,
      maxHealth: stats.maxHealth,
      alive: true,
      radius: HULL.radius,
      halfLength: HULL.halfLength,
      cooldowns: { front: 0, left: 0, right: 0 },
      avoidSide: 0,
      avoidTimer: 0,
    };
  }

  private end(reason: EndReason): void {
    if (this.status === 'ended') return;
    this.status = 'ended';
    this.endReason = reason;
    this.projectiles.length = 0;
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

function capsulesOverlap(a: Ship, b: Ship, slack: number): boolean {
  const acx = Math.cos(a.rotation) * a.halfLength;
  const acy = Math.sin(a.rotation) * a.halfLength;
  const bcx = Math.cos(b.rotation) * b.halfLength;
  const bcy = Math.sin(b.rotation) * b.halfLength;
  const r = a.radius + b.radius + slack;
  return segmentSegmentDist2(
    a.x - acx, a.y - acy, a.x + acx, a.y + acy,
    b.x - bcx, b.y - bcy, b.x + bcx, b.y + bcy,
  ) <= r * r;
}

function pointHitsShip(x: number, y: number, r: number, s: Ship): boolean {
  const cx = Math.cos(s.rotation) * s.halfLength;
  const cy = Math.sin(s.rotation) * s.halfLength;
  const reach = s.radius + r;
  return pointSegmentDist2(x, y, s.x - cx, s.y - cy, s.x + cx, s.y + cy) <= reach * reach;
}
