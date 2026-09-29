import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('2. Asset loading, failure and retry', () => {
  test('shows progress, reports a failure and recovers on retry', async ({ page }) => {
    await openApp(page);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let fail = true;
    await page.context().route('**/assets/ships.png', async (route) => {
      await gate;
      if (fail) await route.abort('failed');
      else await route.continue();
    });

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect(page.getByRole('progressbar', { name: 'Loading game assets' })).toBeVisible();
    release();
    await expect(page.getByRole('alert')).toContainText('failed to load');
    // Combat never started with missing textures.
    await expect(page.getByTestId('arena-canvas')).toHaveCount(0);

    fail = false;
    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByTestId('hud-score')).toBeVisible();
    await expect(page.locator('canvas')).toHaveCount(1);
  });

  test('textures are loaded once and reused by later matches', async ({ page }) => {
    await openApp(page);
    const requests: string[] = [];
    page.on('request', (r) => r.url().includes('/assets/ships.png') && requests.push(r.url()));
    for (let i = 0; i < 2; i++) {
      await page.getByRole('button', { name: 'Play', exact: true }).click();
      await expect(page.getByTestId('hud-score')).toBeVisible();
      await page.keyboard.press('Escape');
      await page.getByRole('button', { name: 'Main Menu' }).click();
    }
    expect(requests).toHaveLength(1);
  });
});
