import { expect, test, type Page } from '@playwright/test';
import { advance, mockDb, openApp, setScenario, startMatch } from './helpers';

async function finishMatch(page: Page) {
  await startMatch(page);
  await page.keyboard.down(' ');
  const end = await advance(page, 60_000);
  await page.keyboard.up(' ');
  expect(end.status).toBe('ended');
  return end;
}

test.describe('11. Match registration, both tabs updated, pending recovery after refresh', () => {
  test.setTimeout(120_000);

  test('a finished match appears once in history and once in the ranking', async ({ page }) => {
    await openApp(page, { spawns: false, options: { sessionDurationSec: 60, spawnIntervalSec: 1.5 } });
    // Open both tabs first so they are cached, then check they refresh after the registration.
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No battles yet');
    await page.getByRole('button', { name: 'Main Menu' }).click();

    const end = await finishMatch(page);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved');
    await page.getByRole('button', { name: 'Main Menu' }).click();

    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    const history = page.getByRole('tabpanel').locator('table').filter({ hasText: 'Saved matches' });
    await expect(history.locator('tbody tr')).toHaveCount(1);
    await expect(history.locator('tbody tr').first()).toContainText(String(end.score));
    await expect(history.locator('tbody tr').first()).toContainText('01:00');
    await expect(history.locator('tbody tr').first()).toContainText('TIME UP');

    await page.getByRole('tab', { name: 'Ranking' }).click();
    const mine = page.getByRole('tabpanel').locator('tbody tr', { hasText: 'YOU' });
    await expect(page.getByRole('tabpanel').locator('caption')).toContainText('60 second battles');
    await expect(mine).toHaveCount(1);
    await expect(mine.locator('td').nth(1)).toHaveText(String(end.score));
    expect(await mockDb(page)).toHaveLength(1);
  });

  test('server unavailable at match end: record kept after refresh and sent after recovery', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'unavailable', options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await finishMatch(page);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    // Starting another match while a record is pending is allowed.
    await page.getByRole('button', { name: 'Play Again' }).click();
    await expect(page.getByTestId('hud-score')).toHaveAccessibleName('Score 0');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Main Menu' }).click();

    // Refresh without the scenario in the URL (the persisted scenario is still "unavailable").
    await page.goto('/?e2e=1&clock=manual&latency=instant&spawns=off');
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    const pending = page.getByRole('tabpanel').locator('table').filter({ hasText: 'Not saved yet' });
    await expect(pending.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
    await expect(pending).toContainText('PENDING');
    expect(await mockDb(page)).toHaveLength(0);

    await setScenario(page, 'normal');
    await pending.getByRole('button', { name: /Retry saving/ }).click();
    const saved = page.getByRole('tabpanel').locator('table').filter({ hasText: 'Saved matches' });
    await expect(saved.locator('tbody tr')).toHaveCount(1);
    await expect(pending).toHaveCount(0);
    expect(await mockDb(page)).toHaveLength(1);
  });

  test('a record pending at refresh time is resent automatically on startup', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'unavailable', options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await finishMatch(page);
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    await page.goto('/?e2e=1&clock=manual&latency=instant&scenario=normal');
    // The result screen was open, so it comes back, and the outbox flushes on startup.
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved');
    expect(await mockDb(page)).toHaveLength(1);
  });
});
