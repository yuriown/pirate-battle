import { expect, test } from '@playwright/test';
import { PLAYER_START, advance, hold, openApp, spawnEnemy, startMatch, state } from './helpers';

test.describe('4. Front and broadside fire, damage, cooldown and scoring', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
  });

  test('front cannon fires one ball forward and respects its cooldown', async ({ page }) => {
    await page.keyboard.press(' ');
    let s = await advance(page, 50);
    expect(s.counters.shots.front).toBe(1);
    expect(s.projectiles).toHaveLength(1);
    expect(s.projectiles[0].y).toBeLessThan(PLAYER_START.y - 51);
    expect(s.projectiles[0].x).toBeCloseTo(PLAYER_START.x, 0);

    // Mashing the key inside the 0.45 s cooldown does not fire again.
    for (let i = 0; i < 5; i++) {
      await page.keyboard.press(' ');
      await advance(page, 50);
    }
    s = await state(page);
    expect(s.counters.shots.front).toBe(1);
    // Holding fires on every cooldown: t = 0, 0.45, 0.9 within 1 s.
    await advance(page, 500);
    s = await hold(page, [' '], 1000);
    expect(s.counters.shots.front).toBe(4);
  });

  test('broadsides fire three parallel balls to each side', async ({ page }) => {
    await page.keyboard.press('q');
    let s = await advance(page, 50);
    expect(s.counters.shots.left).toBe(1);
    expect(s.projectiles).toHaveLength(3);
    // Facing north: port (left) is -x. Parallel: same x, different y.
    for (const p of s.projectiles) expect(p.x).toBeLessThan(PLAYER_START.x);
    const ys = s.projectiles.map((p) => p.y).sort((a, b) => a - b);
    expect(ys[1] - ys[0]).toBeCloseTo(24, 0);
    expect(new Set(s.projectiles.map((p) => Math.round(p.x))).size).toBe(1);

    await page.keyboard.press('e');
    s = await advance(page, 50);
    expect(s.counters.shots.right).toBe(1);
    expect(s.projectiles.filter((p) => p.x > PLAYER_START.x)).toHaveLength(3);
    // Each side has its own cooldown.
    await page.keyboard.press('q');
    s = await advance(page, 50);
    expect(s.counters.shots.left).toBe(1);
  });

  test('hits apply damage once, destroyed enemies score exactly one point', async ({ page }) => {
    const id = await spawnEnemy(page, 'shooter', PLAYER_START.x, PLAYER_START.y - 180, -Math.PI / 2);
    await advance(page, 20);
    await page.keyboard.press(' ');
    let s = await advance(page, 700);
    const enemy = s.enemies.find((e) => e.id === id)!;
    expect(enemy.health).toBe(75 - 34);
    expect(s.projectiles.filter((p) => p.owner === 'player')).toHaveLength(0);

    s = await hold(page, [' '], 2000);
    expect(s.enemies.find((e) => e.id === id)).toBeUndefined();
    expect(s.counters.kills).toBe(1);
    expect(s.score).toBe(1);
    await expect(page.getByTestId('hud-score')).toHaveAccessibleName('Score 1');

    // Destroyed ships no longer collide or score: keep firing through the wreck site.
    s = await hold(page, [' '], 1500);
    expect(s.score).toBe(1);
  });
});
