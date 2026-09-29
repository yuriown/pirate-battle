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

  test('touch buttons steer and fire simultaneously (multi-touch)', async ({ page, isMobile }) => {
    // Touch controls are only rendered on touch (coarse pointer) devices.
    test.skip(!isMobile, 'touch controls are a mobile feature');
    await openApp(page, { spawns: false });
    await startMatch(page);
    const controls = page.getByTestId('touch-controls');
    const forward = controls.getByRole('button', { name: 'Sail forward' });
    const left = controls.getByRole('button', { name: 'Turn left' });
    const fire = controls.getByRole('button', { name: 'Fire front cannon' });
    await expect(forward).toBeVisible();

    await press(forward, 1);
    await press(fire, 3);
    const s0 = await advance(page, 1000);
    expect(s0.player.y).toBeLessThan(PLAYER_START.y - 100);
    expect(s0.counters.shots.front).toBeGreaterThanOrEqual(3);
    await press(left, 2);
    const s = await advance(page, 600);
    expect(s.player.rotation).toBeLessThan(s0.player.rotation);
    expect(s.counters.shots.front).toBeGreaterThan(s0.counters.shots.front);

    // Releasing one finger keeps the others active.
    await release(left, 2);
    const r = (await state(page)).player.rotation;
    const s2 = await advance(page, 500);
    expect(s2.player.rotation).toBeCloseTo(r, 5);
    expect(s2.player.speed).toBeGreaterThan(0);
    await release(forward, 1);
    await release(fire, 3);
    const shots = s2.counters.shots.front;
    const s3 = await advance(page, 1000);
    expect(s3.counters.shots.front).toBe(shots);
  });
});
