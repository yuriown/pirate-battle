import { expect, test } from '@playwright/test';
import { ARENA, PLAYER_START, advance, hold, openApp, startMatch, state } from './helpers';

test.describe('3. Match start, movement, rotation, arena limits and islands', () => {
  test.beforeEach(async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
  });

  test('starts a match with full health, zero score and the configured time', async ({ page }) => {
    const s = await state(page);
    expect(s.status).toBe('running');
    expect(s.player).toMatchObject({ x: PLAYER_START.x, y: PLAYER_START.y, health: 100 });
    expect(s.score).toBe(0);
    await expect(page.getByTestId('hud-time')).toContainText('01:30');
    await expect(page.getByTestId('hud-health')).toHaveText('100 / 100');
  });

  test('moves forward along the heading and rotates both ways (time-based)', async ({ page }) => {
    const s0 = await state(page);
    const s1 = await hold(page, ['w'], 1000);
    expect(s1.player.y).toBeLessThan(s0.player.y - 100);
    expect(s1.player.x).toBeCloseTo(s0.player.x, 3);

    // Turning is independent of the frame rate: 2.4 rad/s for 0.5 s.
    const r0 = s1.player.rotation;
    const s2 = await hold(page, ['d'], 500);
    expect(s2.player.rotation - r0).toBeCloseTo(1.2, 2);
    const s3 = await hold(page, ['a'], 500);
    expect(s3.player.rotation).toBeCloseTo(r0, 2);

    // Releasing the throttle decelerates to a stop.
    const s4 = await advance(page, 3000);
    expect(s4.player.speed).toBe(0);
  });

  test('cannot leave the visible arena', async ({ page }) => {
    // Face right and sail into the east edge.
    await hold(page, ['d'], 655);
    const s = await hold(page, ['w'], 8000);
    expect(s.player.rotation).toBeCloseTo(0, 1);
    const bow = s.player.x + Math.cos(s.player.rotation) * 51;
    expect(bow).toBeLessThanOrEqual(ARENA.width + 0.5);
    expect(bow).toBeGreaterThan(ARENA.width - 5);
    // And the south edge.
    await hold(page, ['d'], 655);
    const s2 = await hold(page, ['w'], 4000);
    expect(s2.player.y + 51).toBeLessThanOrEqual(ARENA.height + 0.5);
  });

  test('collides with islands instead of sailing through them', async ({ page }) => {
    // Straight north from the spawn is the central island (collider bottom edge at y = 628).
    const s = await hold(page, ['w'], 6000);
    expect(s.player.y).toBeGreaterThan(628);
    expect(s.player.y).toBeCloseTo(628 + 51, 0);
    expect(s.player.x).toBeCloseTo(PLAYER_START.x, 0);
  });

  test('can move and fire at the same time', async ({ page }) => {
    const s = await hold(page, ['w', ' '], 1000);
    expect(s.player.y).toBeLessThan(PLAYER_START.y);
    expect(s.counters.shots.front).toBeGreaterThanOrEqual(2);
    const s2 = await hold(page, ['w', 'a', 'q'], 300);
    expect(s2.player.rotation).toBeLessThan(s.player.rotation);
    expect(s2.counters.shots.left).toBe(1);
  });
});
