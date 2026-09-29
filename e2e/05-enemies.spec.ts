import { expect, test } from '@playwright/test';
import { advance, hold, openApp, spawnEnemy, startMatch } from './helpers';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

test.describe('5. Chaser and Shooter behaviour, spawn interval', () => {
  test('chaser pursues, rams, explodes and deals damage without scoring', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    const id = await spawnEnemy(page, 'chaser', 300, 960, 0);
    const s0 = await advance(page, 20);
    const d0 = dist(s0.enemies[0], s0.player);
    const s1 = await advance(page, 1500);
    expect(dist(s1.enemies[0], s1.player)).toBeLessThan(d0 - 150);

    let s = s1;
    for (let i = 0; i < 40 && s.enemies.some((e) => e.id === id); i++) s = await advance(page, 250);
    expect(s.enemies.find((e) => e.id === id)).toBeUndefined();
    expect(s.counters.rams).toBe(1);
    expect(s.player.health).toBe(100 - 25);
    expect(s.score).toBe(0);
    // A destroyed chaser stops dealing damage.
    s = await advance(page, 2000);
    expect(s.player.health).toBe(75);
  });

  test('shooter approaches, stops in range and fires at the player', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    await spawnEnemy(page, 'shooter', 1800, 960, Math.PI);
    const s0 = await advance(page, 20);
    expect(dist(s0.enemies[0], s0.player)).toBeGreaterThan(800);
    expect(s0.counters.shots.enemy).toBe(0);

    let s = s0;
    for (let i = 0; i < 60 && s.counters.shots.enemy === 0; i++) s = await advance(page, 250);
    expect(s.counters.shots.enemy).toBeGreaterThan(0);
    expect(dist(s.enemies[0], s.player)).toBeLessThanOrEqual(380);

    s = await advance(page, 4000);
    expect(s.player.health).toBeLessThan(100);
    // It holds position near its attack range instead of ramming.
    expect(dist(s.enemies[0], s.player)).toBeGreaterThan(150);
  });

  test('enemies spawn on the configured interval, both types, away from the player', async ({ page }) => {
    await openApp(page, { options: { sessionDurationSec: 90, spawnIntervalSec: 4 } });
    await startMatch(page);
    let s = await advance(page, 1400);
    expect(s.enemies).toHaveLength(0);
    s = await advance(page, 200); // t = 1.6 s: first spawn happens at 1.5 s
    expect(s.counters.spawned).toEqual({ chaser: 1, shooter: 0 });
    expect(dist(s.enemies[0], s.player)).toBeGreaterThanOrEqual(560);
    s = await advance(page, 3800); // t = 5.4 s: the next spawn is due at 5.5 s
    expect(s.counters.spawned.chaser + s.counters.spawned.shooter).toBe(1);
    s = await advance(page, 200); // t = 5.6 s
    expect(s.counters.spawned).toEqual({ chaser: 1, shooter: 1 });
    const newest = s.enemies.find((e) => e.kind === 'shooter')!;
    expect(dist(newest, s.player)).toBeGreaterThanOrEqual(560);
    s = await advance(page, 4000); // t = 9.6 s
    expect(s.counters.spawned.chaser + s.counters.spawned.shooter).toBe(3);
  });

  // Regression: with an island between them, enemies used to push against the shore forever.
  test('enemies go around an island that separates them from the player', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    // Park the player west of the central island.
    await hold(page, ['a'], 655);
    await hold(page, ['w'], 1300);
    await advance(page, 1500);
    await hold(page, ['d'], 655);
    await hold(page, ['w'], 2000);
    const parked = await advance(page, 2000);
    expect(parked.player.x).toBeLessThan(800);

    const chaser = await spawnEnemy(page, 'chaser', 1112, 512, Math.PI);
    let s = await advance(page, 20);
    for (let i = 0; i < 20 && s.enemies.some((e) => e.id === chaser); i++) s = await advance(page, 500);
    expect(s.counters.rams).toBe(1);

    await spawnEnemy(page, 'shooter', 1112, 512, Math.PI);
    for (let i = 0; i < 20 && s.counters.shots.enemy === 0; i++) s = await advance(page, 500);
    expect(s.counters.shots.enemy).toBeGreaterThan(0);
  });

  test('the same seed reproduces the same match', async ({ browser }) => {
    const context = await browser.newContext({ baseURL: test.info().project.use.baseURL });
    const page = await context.newPage();
    const run = async () => {
      await openApp(page, { seed: 99 });
      await startMatch(page);
      const s = await advance(page, 12000);
      return s.enemies.map((e) => [e.kind, Math.round(e.x), Math.round(e.y)]);
    };
    const first = await run();
    expect(first.length).toBeGreaterThan(1);
    expect(await run()).toEqual(first);
    await context.close();
  });
});
