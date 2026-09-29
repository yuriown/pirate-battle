import { expect, test } from '@playwright/test';
import { openApp, startMatch, state } from './helpers';

test.describe('1. Options: navigation, validation and persistence', () => {
  test('validates, saves and persists after refresh; each match uses a config snapshot', async ({ page }) => {
    await openApp(page);
    await page.getByRole('button', { name: 'Options' }).click();
    const dialog = page.getByRole('dialog', { name: 'Options' });
    await expect(dialog).toBeVisible();
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);

    // Out-of-range values are rejected with accessible errors and nothing is saved.
    await dialog.getByRole('spinbutton', { name: 'Game session time' }).fill('30');
    await dialog.getByRole('spinbutton', { name: 'Enemy spawn time' }).fill('0');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('alert').first()).toContainText('between 60 and 180');
    await expect(dialog.getByRole('alert').nth(1)).toContainText('between 1 and 10');
    await expect(dialog.getByRole('spinbutton', { name: 'Game session time' })).toHaveAttribute('aria-invalid', 'true');
    expect(await page.evaluate(() => localStorage.getItem('pb.options.v1'))).toBeNull();

    await dialog.getByRole('spinbutton', { name: 'Game session time' }).fill('120');
    await dialog.getByRole('spinbutton', { name: 'Enemy spawn time' }).fill('2');
    await dialog.getByRole('button', { name: 'Increase enemy spawn time' }).click();
    await expect(dialog.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('2.5');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(dialog.getByRole('status')).toHaveText('Options saved.');

    // Escape closes the dialog and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Options' })).toBeFocused();

    await page.reload();
    await page.getByRole('button', { name: 'Options' }).click();
    await expect(page.getByRole('spinbutton', { name: 'Game session time' })).toHaveValue('120');
    await expect(page.getByRole('spinbutton', { name: 'Enemy spawn time' })).toHaveValue('2.5');
    await page.getByRole('button', { name: 'Main Menu' }).click();

    // The match takes a snapshot: 120 s. Changing options mid-match only affects the next match.
    await startMatch(page);
    await expect(page.getByTestId('hud-time')).toContainText('02:00');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Options' }).click();
    await page.getByRole('spinbutton', { name: 'Game session time' }).fill('60');
    await page.getByRole('button', { name: 'Save' }).click();
    await page.getByRole('button', { name: 'Back' }).click();
    expect((await state(page)).timeRemainingSec).toBe(120);
    await page.getByRole('button', { name: 'Restart' }).click();
    await expect(page.getByTestId('hud-time')).toContainText('01:00');
  });

  test('menus are keyboard navigable', async ({ page }) => {
    await openApp(page);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeFocused();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Options' })).toBeVisible();
    // Focus stays trapped inside the dialog.
    for (let i = 0; i < 12; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true);
  });
});
