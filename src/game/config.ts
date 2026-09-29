// Single source of truth for gameplay balancing. Systems read these values; changing
// balance never requires touching simulation code.

export type EnemyKind = 'chaser' | 'shooter';

export interface WeaponConfig {
  damage: number;
  /** Minimum simulated time between two shots of this weapon, in seconds. */
  cooldownSec: number;
  projectileSpeed: number;
  /** Maximum travel distance in world units before the projectile expires. */
  range: number;
  /** Hard lifetime cap in seconds (whichever of range/lifetime comes first). */
  lifetimeSec: number;
}

export interface ShipStats {
  maxHealth: number;
  /** Top forward speed, world units per second. */
  maxSpeed: number;
  acceleration: number;
  deceleration: number;
  /** Radians per second. */
  turnRate: number;
}

export interface GameplayConfig {
  /** Active play time of a match, in seconds. */
  sessionDurationSec: number;
  spawn: {
    intervalSec: number;
    /** Delay before the first spawn (simulated seconds). */
    firstSpawnDelaySec: number;
    /** Weighted random distribution for spawns after the opening sequence. */
    weights: Record<EnemyKind, number>;
    /** Forced first spawns, guaranteeing both enemy types appear in every match. */
    openingSequence: EnemyKind[];
    maxAlive: number;
    /** Spawns closer than this to the player are rejected. */
    minDistanceFromPlayer: number;
    /** Candidate positions tried per spawn before postponing to the next tick. */
    attempts: number;
    /** Distance from the arena edge where enemies enter. */
    edgeMargin: number;
  };
  player: ShipStats & {
    front: WeaponConfig;
    broadside: WeaponConfig & {
      /** Spacing between the three parallel cannonballs along the hull. */
      spacing: number;
    };
  };
  chaser: ShipStats & {
    /** Damage dealt to the player when it rams and explodes. */
    ramDamage: number;
  };
  shooter: ShipStats & {
    /** Distance at which the shooter stops approaching and opens fire. */
    attackRange: number;
    /** Maximum angle between its bow and the player to fire, radians. */
    aimTolerance: number;
    weapon: WeaponConfig;
  };
  projectileRadius: number;
}

export const DEFAULT_GAMEPLAY: GameplayConfig = {
  sessionDurationSec: 90,
  spawn: {
    intervalSec: 3,
    firstSpawnDelaySec: 1.5,
    weights: { chaser: 0.55, shooter: 0.45 },
    openingSequence: ['chaser', 'shooter'],
    maxAlive: 10,
    minDistanceFromPlayer: 560,
    attempts: 24,
    edgeMargin: 70,
  },
  player: {
    maxHealth: 100,
    maxSpeed: 210,
    acceleration: 240,
    deceleration: 180,
    turnRate: 2.4,
    front: { damage: 34, cooldownSec: 0.45, projectileSpeed: 620, range: 620, lifetimeSec: 1.4 },
    broadside: { damage: 25, cooldownSec: 1.2, projectileSpeed: 520, range: 440, lifetimeSec: 1.2, spacing: 24 },
  },
  chaser: {
    maxHealth: 50,
    maxSpeed: 150,
    acceleration: 200,
    deceleration: 200,
    turnRate: 1.9,
    ramDamage: 25,
  },
  shooter: {
    maxHealth: 75,
    maxSpeed: 105,
    acceleration: 140,
    deceleration: 160,
    turnRate: 1.5,
    attackRange: 380,
    aimTolerance: 0.3,
    weapon: { damage: 10, cooldownSec: 1.6, projectileSpeed: 400, range: 460, lifetimeSec: 1.6 },
  },
  projectileRadius: 5,
};

/** Limits enforced by the Options screen (documented in README). */
export const OPTION_LIMITS = {
  sessionDurationSec: { min: 60, max: 180, step: 10 },
  spawnIntervalSec: { min: 1, max: 10, step: 0.5 },
} as const;

export interface PlayerOptions {
  sessionDurationSec: number;
  spawnIntervalSec: number;
}

/** Builds the immutable per-match snapshot from the defaults plus the player's options. */
export function buildMatchConfig(options: PlayerOptions, base: GameplayConfig = DEFAULT_GAMEPLAY): GameplayConfig {
  const config: GameplayConfig = structuredClone(base);
  config.sessionDurationSec = options.sessionDurationSec;
  config.spawn.intervalSec = options.spawnIntervalSec;
  return deepFreeze(config);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value as Record<string, unknown>).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
