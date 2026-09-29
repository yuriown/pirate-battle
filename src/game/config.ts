import { GameConfig } from '@/types/game.types';

export const DEFAULT_CONFIG: GameConfig = {
  sessionDuration: 90,        // 90s default (limits 60 - 180s)
  enemySpawnInterval: 4.5,    // 4.5s default (limits 2 - 10s)
  playerMaxHealth: 100,
  playerSpeed: 190,           // pixels per second
  playerTurnSpeed: 2.4,       // radians per second
  playerFrontCooldown: 300,   // ms
  playerBroadsideCooldown: 750, // ms
  chaserHealth: 30,
  chaserSpeed: 140,
  chaserDamage: 25,
  shooterHealth: 50,
  shooterSpeed: 100,
  shooterAttackRange: 320,
  shooterCooldown: 1500,      // ms
  shooterDamage: 15,
  projectileSpeed: 380,
  projectileLifetime: 1.8,    // seconds
};

export const ARENA_CONFIG = {
  width: 1920,
  height: 1080,
  islands: [
    { id: 'island-center', x: 960, y: 540, radius: 100, name: 'Skull Rock Island' },
    { id: 'island-top-left', x: 420, y: 280, radius: 75, name: 'Coral Shoal' },
    { id: 'island-bottom-right', x: 1500, y: 800, radius: 85, name: 'Treasure Atoll' },
  ],
};

const STORAGE_KEY_CONFIG = 'pirate_battle_config_v1';

export function loadSavedConfig(): GameConfig {
  try {
    const saved = localStorage.getItem(STORAGE_KEY_CONFIG);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_CONFIG,
        sessionDuration: Math.min(180, Math.max(60, Number(parsed.sessionDuration) || DEFAULT_CONFIG.sessionDuration)),
        enemySpawnInterval: Math.min(10, Math.max(2, Number(parsed.enemySpawnInterval) || DEFAULT_CONFIG.enemySpawnInterval)),
      };
    }
  } catch (err) {
    console.error('Failed to load saved config', err);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveConfig(config: Partial<GameConfig>): void {
  try {
    const current = loadSavedConfig();
    const updated = { ...current, ...config };
    localStorage.setItem(STORAGE_KEY_CONFIG, JSON.stringify(updated));
  } catch (err) {
    console.error('Failed to save config', err);
  }
}
