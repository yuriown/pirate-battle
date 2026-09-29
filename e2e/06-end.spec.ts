import { expect, test } from '@playwright/test';
import { PLAYER_START, advance, hold, openApp, spawnEnemy, startMatch, state } from './helpers';

test.describe('6. End by time and by death, frozen simulation, clean restart', () => {
  test('time up ends the match and freezes everything', async ({ page }) => {
    await openApp(page, { spawns: false, options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    await advance(page, 57_000);
    await spawnEnemy(page, 'chaser', 200, 200, 0);
    await spawnEnemy(page, 'shooter', 1700, 200, Math.PI);
    await advance(page, 2000);
    expect((await state(page)).status).toBe('running');
    const end = await advance(page, 1000);
    expect(end.status).toBe('ended');
    expect(end.endReason).toBe('time_up');
    expect(end.timeSec).toBe(60);
    await expect(page.getByRole('dialog', { name: 'Battle Complete' })).toBeVisible();
    await expect(page.getByTestId('result-summary')).toContainText('01:00');
    await expect(page.getByTestId('result-summary')).toContainText('TIME UP');

    // No movement, attacks, spawns, damage or score after the end.
    const after = await hold(page, ['w', ' ', 'q'], 3000);
    expect(after.player).toEqual(end.player);
    expect(after.counters).toEqual(end.counters);
    expect(after.enemies.map((e) => [e.x, e.y])).toEqual(end.enemies.map((e) => [e.x, e.y]));
    expect(after.projectiles).toHaveLength(0);
  });

  test('death ends the match; Play Again starts a clean match', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    await hold(page, [' '], 400);
    // Four chasers ramming (25 damage each) sink the player.
    for (let i = 0; i < 4; i++) {
      await spawnEnemy(page, 'chaser', PLAYER_START.x + 160, PLAYER_START.y, Math.PI);
      let s = await state(page);
      for (let k = 0; k < 20 && s.status === 'running' && s.counters.rams <= i; k++) s = await advance(page, 200);
    }
    const end = await state(page);
    expect(end.status).toBe('ended');
    expect(end.endReason).toBe('destroyed');
    expect(end.player.health).toBe(0);
    expect(end.score).toBe(0);
    await expect(page.getByRole('dialog', { name: 'Ship Destroyed' })).toBeVisible();
    await expect(page.getByTestId('result-summary')).toContainText('DEFEATED');

    await page.getByRole('button', { name: 'Play Again' }).click();
    const fresh = await state(page);
    expect(fresh).toMatchObject({ status: 'running', score: 0, timeSec: 0, enemies: [], projectiles: [] });
    expect(fresh.player).toMatchObject({ x: PLAYER_START.x, y: PLAYER_START.y, health: 100, speed: 0 });
    expect(fresh.counters.shots).toEqual({ front: 0, left: 0, right: 0, enemy: 0 });
    expect(fresh.hud.matchIndex).toBe(2);
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
    await expect(page.getByTestId('hud-time')).toContainText('01:30');
    await expect(page.locator('canvas')).toHaveCount(1);
  });
});
