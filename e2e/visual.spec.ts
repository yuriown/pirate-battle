import { expect, test } from '@playwright/test';
import { advance, hold, openApp, spawnEnemy, startMatch } from './helpers';

// Visual regression baselines (versioned under e2e/__screenshots__). Everything that moves is
// driven by the seeded simulation and the manual clock, so frames are reproducible.
test.describe('Visual regression', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');
  test('main menu', async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot('menu.png');
  });

  test('arena in a stable state', async ({ page }) => {
    await openApp(page, { spawns: false, seed: 3 });
    await startMatch(page);
    await spawnEnemy(page, 'chaser', 400, 300, 0.4);
    await spawnEnemy(page, 'shooter', 1550, 560, Math.PI);
    await hold(page, ['w'], 600);
    await advance(page, 3000);
    await expect(page).toHaveScreenshot('arena.png');
  });

  test('result screen', async ({ page }) => {
    await openApp(page, { spawns: false, options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    await advance(page, 60_000);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved');
    await advance(page, 3000);
    await expect(page).toHaveScreenshot('result.png');
  });
});
