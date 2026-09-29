export type GameScreen = 'MENU' | 'PLAYING' | 'PAUSED' | 'GAME_OVER' | 'OPTIONS';
export type ActiveMenuTab = 'PLAY' | 'RANKING' | 'HISTORY';

export type ShipType = 'PLAYER' | 'CHASER' | 'SHOOTER';
export type EndReason = 'TIME_EXPIRED' | 'SHIP_DESTROYED' | 'PLAYER_SURRENDERED';

export interface Vector2D {
  x: number;
  y: number;
}

export interface GameConfig {
  sessionDuration: number;    // seconds (60 - 180)
  enemySpawnInterval: number; // seconds (2 - 10)
  playerMaxHealth: number;
  playerSpeed: number;
  playerTurnSpeed: number;
  playerFrontCooldown: number; // ms
  playerBroadsideCooldown: number; // ms
  chaserHealth: number;
  chaserSpeed: number;
  chaserDamage: number;
  shooterHealth: number;
  shooterSpeed: number;
  shooterAttackRange: number;
  shooterCooldown: number; // ms
  shooterDamage: number;
  projectileSpeed: number;
  projectileLifetime: number; // seconds
}

export interface IslandEntity {
  id: string;
  x: number;
  y: number;
  radius: number;
  name: string;
}

export interface ShipEntity {
  id: string;
  type: ShipType;
  x: number;
  y: number;
  rotation: number; // in radians
  speed: number;
  targetSpeed: number;
  turnDirection: number; // -1 (left), 0 (none), 1 (right)
  health: number;
  maxHealth: number;
  width: number;
  height: number;
  lastFrontShotTime: number;
  lastBroadsideShotTime: number;
  isDead: boolean;
  scoreValue: number;
}

export interface ProjectileEntity {
  id: string;
  ownerId: string;
  ownerType: ShipType;
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  createdAt: number;
  lifetime: number;
  isDestroyed: boolean;
}

export interface ParticleEntity {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: number;
  alpha: number;
  lifetime: number;
  maxLifetime: number;
}

export interface GameSnapshot {
  score: number;
  timeRemaining: number;
  sessionDuration: number;
  playerHealth: number;
  playerMaxHealth: number;
  isPaused: boolean;
  isGameOver: boolean;
  endReason: EndReason | null;
  chaserCount: number;
  shooterCount: number;
}

export interface MatchResult {
  id: string;
  playerId: string;
  playerName: string;
  date: string;
  score: number;
  durationSeconds: number;
  endReason: EndReason;
  configSnapshot: {
    sessionDuration: number;
    enemySpawnInterval: number;
  };
  submittedAt?: string;
  status?: 'PENDING' | 'SUCCESS' | 'ERROR';
}

export interface RankingEntry {
  rank: number;
  matchId: string;
  playerId: string;
  playerName: string;
  score: number;
  durationSeconds: number;
  date: string;
  config: {
    sessionDuration: number;
    enemySpawnInterval: number;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export type NetworkScenario = 
  | 'DEFAULT' 
  | 'SLOW_NETWORK' 
  | 'HIGH_LATENCY' 
  | 'ERROR_500' 
  | 'TIMEOUT' 
  | 'OFFLINE'
  | 'EMPTY_LIST';
