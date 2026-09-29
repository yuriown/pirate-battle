import { expect, type Page } from '@playwright/test';

export interface GameState {
  status: 'running' | 'ended';
  endReason: 'time_up' | 'destroyed' | null;
  timeSec: number;
  timeRemainingSec: number;
  score: number;
  player: { x: number; y: number; rotation: number; speed: number; health: number; maxHealth: number; cooldowns: { front: number; left: number; right: number } };
  enemies: { id: number; kind: 'chaser' | 'shooter'; x: number; y: number; rotation: number; health: number; maxHealth: number }[];
  projectiles: { id: number; owner: 'player' | 'enemy'; x: number; y: number }[];
  counters: { spawned: { chaser: number; shooter: number }; shots: { front: number; left: number; right: number; enemy: number }; kills: number; rams: number };
  hud: { status: 'running' | 'paused' | 'ended'; pauseReason: string | null; score: number; timeRemainingSec: number; health: number; matchIndex: number };
  displayObjects: number;
}

export interface AppOptions {
  seed?: number;
  manualClock?: boolean;
  spawns?: boolean;
  scenario?: string;
  latency?: 'instant' | 'realistic';
  timeoutMs?: number;
  options?: { sessionDurationSec: number; spawnIntervalSec: number };
}

/** Opens the app in an isolated state (fresh context per test) with deterministic flags. */
export async function openApp(page: Page, o: AppOptions = {}): Promise<void> {
  const params = new URLSearchParams({ e2e: '1', seed: String(o.seed ?? 1), scenario: o.scenario ?? 'normal', latency: o.latency ?? 'instant' });
  if (o.manualClock !== false) params.set('clock', 'manual');
  if (o.spawns === false) params.set('spawns', 'off');
  if (o.timeoutMs) params.set('timeout', String(o.timeoutMs));
  // A fixed player: the default name is derived from a random id and would change layouts between runs.
  await page.addInitScript(() => {
    if (!localStorage.getItem('pb.player.v1')) {
      localStorage.setItem('pb.player.v1', JSON.stringify({ playerId: 'e2e-player', playerName: 'Captain Test' }));
    }
  });
  if (o.options) {
    const value = JSON.stringify(o.options);
    await page.addInitScript((v) => {
      if (!sessionStorage.getItem('pb.e2e.init')) {
        localStorage.setItem('pb.options.v1', v);
        sessionStorage.setItem('pb.e2e.init', '1');
      }
    }, value);
  }
  await page.goto(`/?${params.toString()}`);
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
}

export async function startMatch(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click();
  await page.waitForFunction(() => !!window.__PB__?.game);
  await expect(page.getByTestId('hud-score')).toBeVisible();
}

export function state(page: Page): Promise<GameState> {
  return page.evaluate(() => window.__PB__!.game!.getState() as unknown as GameState);
}

/** Advances simulated time (fixed steps, real rules/input/rendering). */
export async function advance(page: Page, ms: number): Promise<GameState> {
  await page.evaluate((t) => window.__PB__!.game!.advance(t), ms);
  return state(page);
}

/** Holds keyboard keys while advancing the simulation, then releases them. */
export async function hold(page: Page, keys: string[], ms: number): Promise<GameState> {
  for (const k of keys) await page.keyboard.down(k);
  const s = await advance(page, ms);
  for (const k of keys) await page.keyboard.up(k);
  return s;
}

export async function spawnEnemy(page: Page, kind: 'chaser' | 'shooter', x: number, y: number, rotation: number): Promise<number> {
  return page.evaluate(([k, px, py, r]) => window.__PB__!.game!.spawnEnemy(k as 'chaser' | 'shooter', px as number, py as number, r as number), [kind, x, y, rotation] as const);
}

/** Collects console errors and uncaught exceptions for the "no unhandled errors" requirement. */
export function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console: ${m.text()}`);
  });
  return errors;
}

export async function mockDb(page: Page): Promise<{ matchId: string; playerId: string; score: number }[]> {
  return page.evaluate(() => (window as unknown as { __pbMock: { db: { list(): { matchId: string; playerId: string; score: number }[] } } }).__pbMock.db.list());
}

export async function setScenario(page: Page, id: string): Promise<void> {
  await page.evaluate((s) => (window as unknown as { __pbMock: { setScenario(id: string): void } }).__pbMock.setScenario(s), id);
}

export const PLAYER_START = { x: 960, y: 940 };
export const ARENA = { width: 1920, height: 1080 };
