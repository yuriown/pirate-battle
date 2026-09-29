import { expect, test, type Page } from '@playwright/test';
import { advance, mockDb, openApp, setScenario, startMatch } from './helpers';

function countPosts(page: Page): string[] {
  const posts: string[] = [];
  page.on('request', (r) => {
    if (r.method() === 'POST' && r.url().includes('/api/matches')) posts.push(r.url());
  });
  return posts;
}

async function finishFailedMatch(page: Page) {
  await startMatch(page);
  await advance(page, 60_000);
  await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'failed', { timeout: 20_000 });
}

test.describe('12. Resend after timeout without duplicates, late responses never win', () => {
  test.setTimeout(120_000);

  test('server commits but the client times out: the retry recovers the same record', async ({ page }) => {
    const posts = countPosts(page);
    await openApp(page, { spawns: false, scenario: 'post-timeout-after-commit', timeoutMs: 1200, options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    const end = await advance(page, 60_000);
    expect(end.status).toBe('ended');
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved', { timeout: 20_000 });
    // The first POST timed out (after the server stored it) and at least one retry followed.
    expect(posts.length).toBeGreaterThanOrEqual(2);
    expect(await mockDb(page)).toHaveLength(1);

    // Re-sending the same match any number of times returns the existing record.
    await page.evaluate(async () => {
      const raw = localStorage.getItem('pb.lastResult.v1')!;
      await Promise.all([1, 2, 3].map(() => fetch('/api/matches', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw })));
    });
    expect(await mockDb(page)).toHaveLength(1);
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    await expect(page.getByRole('tabpanel').locator('table').filter({ hasText: 'Saved matches' }).locator('tbody tr')).toHaveCount(1);
  });

  test('repeated Retry clicks join a single request chain', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'unavailable', options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await finishFailedMatch(page);
    await setScenario(page, 'slow');
    const posts = countPosts(page);
    // Three clicks in the same tick, before React can swap the button for the "Recording…" state.
    await page.getByTestId('submission-status').getByRole('button', { name: 'Retry' }).evaluate((button: HTMLButtonElement) => {
      button.click();
      button.click();
      button.click();
    });
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved', { timeout: 20_000 });
    expect(posts).toHaveLength(1);
    expect(await mockDb(page)).toHaveLength(1);
  });

  test('a slow read already in flight cannot hide a match registered meanwhile', async ({ page }) => {
    await openApp(page, { spawns: false, scenario: 'unavailable', options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await finishFailedMatch(page);
    await page.getByRole('button', { name: 'Main Menu' }).click();

    // In "out-of-order" the next read is slow (computed now, against the empty database).
    await setScenario(page, 'out-of-order');
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    const panel = page.getByRole('tabpanel');
    const pending = panel.locator('table').filter({ hasText: 'Not saved yet' });
    // Register the pending match through the app while that first history read is still loading.
    await pending.getByRole('button', { name: /Retry saving/ }).click();

    const saved = panel.locator('table').filter({ hasText: 'Saved matches' });
    await expect(saved.locator('tbody tr')).toHaveCount(1, { timeout: 15_000 });
    // Well after the slow (older) response has arrived, the registered match is still listed.
    await page.waitForTimeout(1500);
    await expect(saved.locator('tbody tr')).toHaveCount(1);
    await expect(pending).toHaveCount(0);
    await expect(panel).not.toContainText('No battles yet');
    expect(await mockDb(page)).toHaveLength(1);
  });

  test('out-of-order page responses: the last requested page wins', async ({ page }) => {
    await openApp(page, { scenario: 'out-of-order' });
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByText('Page 1 of 3')).toBeVisible({ timeout: 15_000 });
    await panel.getByRole('button', { name: 'Next page' }).click();
    await panel.getByRole('button', { name: 'Next page' }).click();
    await expect(panel.getByText('Page 3 of 3')).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(panel.getByText('Page 3 of 3')).toBeVisible();
    await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('13');
  });
});
