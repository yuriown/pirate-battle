import { expect, test } from '@playwright/test';
import { advance, openApp, startMatch } from './helpers';

test.describe('8. Result screen and its persistence after refresh', () => {
  test('shows score, time played, end reason and registration status, and survives a refresh', async ({ page }) => {
    await openApp(page, { spawns: false, options: { sessionDurationSec: 60, spawnIntervalSec: 3 } });
    await startMatch(page);
    await page.keyboard.down(' ');
    const end = await advance(page, 60_000);
    await page.keyboard.up(' ');
    expect(end.status).toBe('ended');

    const dialog = page.getByRole('dialog', { name: 'Battle Complete' });
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText(String(end.score));
    await expect(page.getByTestId('result-summary')).toContainText('01:00 · TIME UP');
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved');
    await expect(dialog.getByRole('button', { name: 'Play Again' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Main Menu' })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('dialog', { name: 'Battle Complete' })).toBeVisible();
    await expect(page.getByTestId('result-score')).toHaveText(String(end.score));
    await expect(page.getByTestId('result-summary')).toContainText('01:00 · TIME UP');
    await expect(page.getByTestId('submission-status')).toHaveAttribute('data-status', 'saved');

    // Leaving the result screen: the menu keeps a summary of the last match, also after refresh.
    await page.getByRole('button', { name: 'Main Menu' }).click();
    await expect(page.getByTestId('last-result')).toContainText(`${end.score} pts · 01:00 · TIME UP`);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible();
    await expect(page.getByTestId('last-result')).toContainText(`${end.score} pts`);
  });
});
