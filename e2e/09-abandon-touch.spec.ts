import { expect, test, type Locator } from '@playwright/test';
import { PLAYER_START, advance, mockDb, openApp, startMatch, state, trackErrors } from './helpers';

async function press(button: Locator, pointerId: number) {
  await button.dispatchEvent('pointerdown', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, button: 0, buttons: 1 });
}
async function release(button: Locator, pointerId: number) {
  await button.dispatchEvent('pointerup', { pointerId, pointerType: 'touch', isPrimary: pointerId === 1, button: 0, buttons: 0 });
}

test.describe('9. Abandoning, repeated navigation and touch controls', () => {
  test('leaving or refreshing mid-match abandons it without recording', async ({ page }) => {
    await openApp(page);
    await startMatch(page);
    await advance(page, 5000);
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();

    await startMatch(page);
    await advance(page, 5000);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByTestId('last-result')).toHaveCount(0);
    expect(await mockDb(page)).toHaveLength(0);
    expect(await page.evaluate(() => localStorage.getItem('pb.pending.v1'))).toBeNull();
  });

  test('repeated navigation between screens releases the combat resources', async ({ page }) => {
    const errors = trackErrors(page);
    await openApp(page);
    for (let i = 0; i < 5; i++) {
      await startMatch(page);
      await advance(page, 2000);
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main Menu' }).click();
      await expect(page.locator('canvas')).toHaveCount(0);
      await page.getByRole('button', { name: 'Ranking', exact: true }).click();
      await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true');
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
    expect(await page.evaluate(() => window.__PB__?.game ?? null)).toBeNull();
    expect(errors).toEqual([]);
  });

  test('joystick steers and sails while the fire button shoots (multi-touch)', async ({ page, isMobile }) => {
    // Touch controls are only rendered on touch (coarse pointer) devices.
    test.skip(!isMobile, 'touch controls are a mobile feature');
    await openApp(page, { spawns: false });
    await startMatch(page);
    const stick = page.getByTestId('joystick');
    const fire = page.getByTestId('touch-controls').getByRole('button', { name: 'Fire front cannon' });
    await expect(stick).toBeVisible();
    const box = (await stick.boundingBox())!;
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    const drag = (type: string, x: number, y: number) =>
      stick.dispatchEvent(type, { pointerId: 1, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, button: 0, buttons: type === 'pointerup' ? 0 : 1 });

    // Push the stick up (north, the ship's initial heading) and hold fire with a second finger.
    await drag('pointerdown', cx, cy);
    await drag('pointermove', cx, cy - box.height / 2);
    await press(fire, 2);
    const s0 = await advance(page, 1000);
    expect(s0.player.y).toBeLessThan(PLAYER_START.y - 100);
    expect(s0.player.rotation).toBeCloseTo(-Math.PI / 2, 3);
    expect(s0.counters.shots.front).toBeGreaterThanOrEqual(3);

    // Point it west: the ship turns towards it (left from north) at its turn rate while still sailing.
    await drag('pointermove', cx - box.width / 2, cy);
    const s1 = await advance(page, 300);
    expect(s1.player.rotation).toBeLessThan(s0.player.rotation);
    expect(s1.player.speed).toBeGreaterThan(0);
    const s2 = await advance(page, 1500);
    expect(Math.abs(Math.abs(s2.player.rotation) - Math.PI)).toBeLessThan(0.01);
    expect(s2.counters.shots.front).toBeGreaterThan(s0.counters.shots.front);

    // A small push inside the dead zone neither steers nor sails.
    await drag('pointermove', cx + 3, cy + 3);
    const r = (await state(page)).player.rotation;
    const s3 = await advance(page, 2000);
    expect(s3.player.rotation).toBeCloseTo(r, 5);
    expect(s3.player.speed).toBe(0);

    // Releasing both fingers stops everything.
    await drag('pointerup', cx, cy);
    await release(fire, 2);
    const shots = s3.counters.shots.front;
    const s4 = await advance(page, 1000);
    expect(s4.counters.shots.front).toBe(shots);
  });
});
