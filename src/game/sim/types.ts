import type { EnemyKind } from '../config';

export type ShipKind = 'player' | EnemyKind;
export type EndReason = 'time_up' | 'destroyed';
export type WeaponSlot = 'front' | 'left' | 'right';

export interface InputState {
  forward: boolean;
  turnLeft: boolean;
  turnRight: boolean;
  fireFront: boolean;
  fireLeft: boolean;
  fireRight: boolean;
}

export const EMPTY_INPUT: Readonly<InputState> = Object.freeze({
  forward: false,
  turnLeft: false,
  turnRight: false,
  fireFront: false,
  fireLeft: false,
  fireRight: false,
});

export interface Ship {
  id: number;
  kind: ShipKind;
  x: number;
  y: number;
  /** Heading in radians; 0 points to +x, PI/2 to +y (screen down). */
  rotation: number;
  /** Pose at the start of the current step, for render interpolation. */
  prevX: number;
  prevY: number;
  prevRotation: number;
  speed: number;
  health: number;
  maxHealth: number;
  alive: boolean;
  /** Collision capsule along the heading. */
  radius: number;
  halfLength: number;
  /** Remaining cooldown per weapon, simulated seconds. */
  cooldowns: Record<WeaponSlot, number>;
  /** Detour side chosen by the avoidance steering (-1, 0, 1) and how long it is remembered. */
  avoidSide: number;
  avoidTimer: number;
}

export interface Projectile {
  id: number;
  owner: 'player' | 'enemy';
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  damage: number;
  traveled: number;
  range: number;
  age: number;
  lifetime: number;
}

export type SimEvent =
  | { type: 'spawn'; shipId: number; kind: ShipKind }
  | { type: 'shot'; weapon: WeaponSlot | 'enemy'; x: number; y: number; angle: number }
  | { type: 'hit'; shipId: number; x: number; y: number; damage: number }
  | { type: 'projectile-expired'; x: number; y: number; reason: 'range' | 'island' | 'bounds' }
  | { type: 'destroyed'; shipId: number; kind: ShipKind; x: number; y: number; rotation: number; cause: 'player-fire' | 'ram' | 'enemy-fire' }
  | { type: 'rammed'; shipId: number; x: number; y: number; damage: number }
  | { type: 'bump'; x: number; y: number }
  | { type: 'score'; score: number }
  | { type: 'ended'; reason: EndReason };

export interface SimCounters {
  spawned: Record<EnemyKind, number>;
  shots: Record<WeaponSlot | 'enemy', number>;
  kills: number;
  rams: number;
  playerDamageTaken: number;
}

/** Plain-data view of the world used by the HUD sync and by the Playwright instrumentation. */
export interface WorldSnapshot {
  status: 'running' | 'ended';
  endReason: EndReason | null;
  timeSec: number;
  timeRemainingSec: number;
  score: number;
  player: { x: number; y: number; rotation: number; speed: number; health: number; maxHealth: number; cooldowns: Record<WeaponSlot, number> };
  enemies: { id: number; kind: EnemyKind; x: number; y: number; rotation: number; speed: number; health: number; maxHealth: number }[];
  projectiles: { id: number; owner: 'player' | 'enemy'; x: number; y: number }[];
  counters: SimCounters;
  nextSpawnInSec: number;
}
