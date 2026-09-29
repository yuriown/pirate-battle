import { expect, test } from '@playwright/test';
import { advance, hold, openApp, startMatch, state } from './helpers';

test.describe('7. Pause, focus loss and resume without undue clock advance', () => {
  test('manual pause freezes clock, cooldowns and simulation; held input is discarded', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    await hold(page, ['w', ' '], 1000);
    const before = await state(page);
    expect(before.player.cooldowns.front).toBeGreaterThan(0);

    await page.keyboard.press('Escape');
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Ready when you are.');

    // Keys pressed while paused and time passing do nothing.
    await page.keyboard.down('w');
    await page.keyboard.down('j');
    const during = await advance(page, 5000);
    expect(during.timeSec).toBe(before.timeSec);
    expect(during.player).toEqual(before.player);
    expect(during.hud.status).toBe('paused');

    await dialog.getByRole('button', { name: 'Resume' }).click();
    await expect(dialog).toBeHidden();
    // Keys still held from the paused period do not act until pressed again.
    const resumed = await advance(page, 500);
    expect(resumed.timeSec).toBeCloseTo(before.timeSec + 0.5, 3);
    expect(resumed.counters.shots.front).toBe(before.counters.shots.front);
    await page.keyboard.up('w');
    await page.keyboard.up('j');
  });

  test('losing focus or hiding the tab pauses automatically; resume needs a player action', async ({ page }) => {
    await openApp(page, { spawns: false });
    await startMatch(page);
    await advance(page, 2000);
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    const dialog = page.getByRole('dialog', { name: 'Paused' });
    await expect(dialog).toContainText('lost focus');
    const t = (await state(page)).timeSec;
    await advance(page, 3000);
    expect((await state(page)).timeSec).toBe(t);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(dialog).toContainText('tab was hidden');
    expect((await state(page)).hud.pauseReason).toBe('hidden');
  });

  test('with the real clock the timer does not advance while paused', async ({ page }) => {
    await openApp(page, { spawns: false, manualClock: false });
    await startMatch(page);
    await page.waitForTimeout(500);
    await page.keyboard.press('p');
    await expect(page.getByRole('dialog', { name: 'Paused' })).toBeVisible();
    const t = (await state(page)).timeSec;
    await page.waitForTimeout(2000);
    expect((await state(page)).timeSec).toBe(t);
    const resumedAt = Date.now();
    await page.keyboard.press('p');
    await page.waitForTimeout(300);
    const after = (await state(page)).timeSec;
    const realElapsed = (Date.now() - resumedAt) / 1000;
    expect(after).toBeGreaterThan(t);
    // Only the time since resuming counts: the 2 s spent paused never reach the game clock.
    expect(after - t).toBeLessThanOrEqual(realElapsed + 0.05);
  });
});
