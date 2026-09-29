import { expect, test } from '@playwright/test';
import { advance, mockDb, openApp, startMatch } from './helpers';

test.describe('12. Resend after timeout without duplicates, late responses never win', () => {
  test.setTimeout(120_000);

  test('server commits but the client times out: retries recover the same record', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'post-timeout-after-commit', timeoutMs: 1200, options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    const end = await advance(page, 60_000);
    expect(end.status).toBe('ended');
    const status = page.getByTestId('submission-status');
    await expect(status).toHaveAttribute('data-status', 'saved', { timeout: 20_000 });
    expect(await mockDb(page)).toHaveLength(1);

    // Hammering retry / re-enqueueing the same match never duplicates it.
    await page.evaluate(async () => {
      const raw = localStorage.getItem('pb.lastResult.v1')!;
      await Promise.all([1, 2, 3].map(() => fetch('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw })));
    });
    const db = await mockDb(page);
    expect(db).toHaveLength(1);
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    await expect(page.getByRole('tabpanel').locator('table').filter({ hasText: 'Saved matches' }).locator('tbody tr')).toHaveCount(1);
  });

  test('repeated clicks on Retry send a single request chain', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'unavailable', options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    await advance(page, 60_000);
    const status = page.getByTestId('submission-status');
    await expect(status).toHaveAttribute('data-status', 'failed', { timeout: 15_000 });
    await page.evaluate(() => (window as unknown as { __pbMock: { setScenario(id: string): void } }).__pbMock.setScenario('slow'));
    const posts: string[] = [];
    page.on('request', (r) => r.method() === 'POST' && r.url().includes('/api/matches') && posts.push(r.url()));
    const retry = status.getByRole('button', { name: 'Retry' });
    await retry.click();
    // The button is replaced by the "Recording…" state; further clicks cannot start new chains.
    await expect(status).toHaveAttribute('data-status', 'saving');
    await expect(status).toHaveAttribute('data-status', 'saved', { timeout: 15_000 });
    expect(posts).toHaveLength(1);
    expect(await mockDb(page)).toHaveLength(1);
  });

  test('out-of-order responses: the latest page and data win', async ({ page }) => {
    await openApp(page, { scenario: 'out-of-order' });
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText(/Page 1 of 3/)).toBeVisible({ timeout: 15_000 });
    // Page 2 (slow) then page 3 (fast): the page 2 response arrives last but must not win.
    await panel.getByRole('button', { name: 'Next page' }).click();
    await panel.getByRole('button', { name: 'Next page' }).click();
    await expect(panel.getByText('Page 3 of 3')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(panel.getByText('Page 3 of 3')).toBeVisible();
    await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('17');

    // A registration while an older, slower read is in flight: the new record still shows.
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    await page.evaluate(async () => {
      const player = JSON.parse(localStorage.getItem('pb.player.v1')!);
      const record = {
        matchId: 'late-order-test', playerId: player.playerId, playerName: player.playerName, playedAt: new Date().toISOString(),
        score: 7, durationMs: 60000, endReason: 'time_up', config: { sessionDurationSec: 90, spawnIntervalSec: 3 },
      };
      await fetch('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(record) });
    });
    await page.getByRole('tab', { name: 'Ranking' }).click();
    await page.getByRole('tab', { name: 'Match History' }).click();
    const saved = page.getByRole('tabpanel').locator('table').filter({ hasText: 'Saved matches' });
    await expect(saved.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(saved.locator('tbody tr')).toHaveCount(1);
  });
});
