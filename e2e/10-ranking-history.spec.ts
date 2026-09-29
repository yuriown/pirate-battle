import { expect, test } from '@playwright/test';
import { openApp } from './helpers';

test.describe('10. Ranking and Match History: queries, pagination, loading, empty and error', () => {
  test('ranking is paginated, ordered by score and scoped to the current configuration', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    const panel = page.getByRole('tabpanel');
    await expect(panel.getByRole('table')).toBeVisible();
    await expect(panel.locator('caption')).toContainText('90 second battles');
    await expect(panel.getByText('Page 1 of 3')).toBeVisible();
    const scores = await panel.locator('tbody tr td:nth-child(3)').allInnerTexts();
    expect(scores).toHaveLength(8);
    expect([...scores].map(Number)).toEqual([...scores].map(Number).sort((a, b) => b - a));
    await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('01');

    await panel.getByRole('button', { name: 'Next page' }).click();
    await expect(panel.getByText('Page 2 of 3')).toBeVisible();
    await expect(panel.locator('tbody tr').first().locator('td').first()).toHaveText('09');
    await panel.getByRole('button', { name: 'Previous page' }).click();
    await expect(panel.getByText('Page 1 of 3')).toBeVisible();

    // Tabs follow the WAI-ARIA pattern (arrow keys move between them).
    await page.getByRole('tab', { name: 'Ranking' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Match History' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('No battles yet');
  });

  test('shows a loading state on slow networks', async ({ page }) => {
    await openApp(page, { scenario: 'slow', latency: 'realistic' });
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Loading ranking' })).toBeVisible();
    await expect(page.getByRole('tabpanel').getByRole('table')).toBeVisible({ timeout: 15_000 });
  });

  test('shows empty states', async ({ page }) => {
    await openApp(page, { scenario: 'empty' });
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No battles recorded yet');
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No battles yet');
  });

  test('ranking failure shows an accessible error with retry, history still works', async ({ page }) => {
    await openApp(page, { scenario: 'ranking-fails' });
    await page.getByRole('button', { name: 'Ranking', exact: true }).click();
    const alert = page.getByRole('tabpanel').getByRole('alert');
    await expect(alert).toContainText('Could not load the ranking', { timeout: 15_000 });
    await page.getByRole('tab', { name: 'Match History' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No battles yet');
    // The game stays playable when the API fails.
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeEnabled();
  });

  test('history failure shows an error and recovers on retry', async ({ page }) => {
    await openApp(page, { scenario: 'history-fails' });
    await page.getByRole('button', { name: 'Match History', exact: true }).click();
    const alert = page.getByRole('tabpanel').getByRole('alert');
    await expect(alert).toBeVisible({ timeout: 15_000 });
    await page.evaluate(() => (window as unknown as { __pbMock: { setScenario(id: string): void } }).__pbMock.setScenario('normal'));
    await alert.getByRole('button', { name: 'Retry' }).click();
    await expect(page.getByRole('tabpanel')).toContainText('No battles yet');
  });
});
