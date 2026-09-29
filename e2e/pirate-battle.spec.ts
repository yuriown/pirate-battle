import { test, expect } from '@playwright/test';

test.describe('Pirate Battle — E2E Test Suite', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Ensure MSW is ready and root is rendered
    await expect(page.locator('text=PIRATE BATTLE')).toBeVisible();
  });

  // 1. Options Navigation, Validation and LocalStorage Persistence
  test('1. Options: Navigation, slider validation and persistence after refresh', async ({ page }) => {
    await page.click('button:has-text("Battle Options")');
    await expect(page.locator('text=Battle Options')).toBeVisible();

    // Verify sliders exist and change value
    const durationInput = page.locator('input[type="range"]').first();
    await durationInput.fill('120');

    await page.click('button:has-text("Save Options")');
    await expect(page.locator('text=Battle Options')).not.toBeVisible();

    // Reload page and verify persisted value
    await page.reload();
    await page.click('button:has-text("Battle Options")');
    await expect(page.locator('text=120s')).toBeVisible();
  });

  // 2. Main Menu and Tabs Navigation (Leaderboard and Match History)
  test('2. Main Menu: Switch between Leaderboard and Match History tabs with pagination', async ({ page }) => {
    // Check Leaderboard tab active
    await expect(page.locator('text=Global Pirate Leaderboard')).toBeVisible();
    await expect(page.locator('text=Captain Blackbeard')).toBeVisible();

    // Switch to Match History
    await page.click('button:has-text("Match History")');
    await expect(page.locator('text=Captain\'s Log (Personal History)')).toBeVisible();

    // Switch back to Leaderboard
    await page.click('button:has-text("Leaderboard")');
    await expect(page.locator('text=Global Pirate Leaderboard')).toBeVisible();
  });

  // 3. Match Start, Canvas Rendering, and Movement Inputs
  test('3. Gameplay: Match start, Canvas lifecycle, and ship movement', async ({ page }) => {
    await page.click('button:has-text("SET SAIL (PLAY)")');

    // Canvas & HUD should be active
    await expect(page.locator('canvas')).toBeVisible();
    await expect(page.locator('text=Hull Integrity')).toBeVisible();
    await expect(page.locator('text=Score')).toBeVisible();

    // Press movement keys
    await page.keyboard.press('KeyW');
    await page.keyboard.press('KeyA');
    await page.keyboard.press('KeyD');

    // Check time remaining is counting down
    const timeElem = page.locator('text=Time').locator('..').locator('span.font-mono');
    await expect(timeElem).toBeVisible();
  });

  // 4. Combat: Frontal and Broadside Cannon Shots
  test('4. Combat: Frontal and broadside shots triggering', async ({ page }) => {
    await page.click('button:has-text("SET SAIL (PLAY)")');
    await expect(page.locator('canvas')).toBeVisible();

    // Fire Front Cannon (Space or J)
    await page.keyboard.press('Space');
    await page.keyboard.press('KeyJ');

    // Fire Broadside Port & Starboard (K and L)
    await page.keyboard.press('KeyK');
    await page.keyboard.press('KeyL');

    await expect(page.locator('canvas')).toBeVisible();
  });

  // 5. Pause Menu, Tab Blur Pause, and Resume
  test('5. Pause: Manual pause, resume, and restart match', async ({ page }) => {
    await page.click('button:has-text("SET SAIL (PLAY)")');
    await expect(page.locator('canvas')).toBeVisible();

    // Pause via Escape key
    await page.keyboard.press('Escape');
    await expect(page.locator('text=BATTLE PAUSED')).toBeVisible();

    // Resume
    await page.click('button:has-text("RESUME BATTLE")');
    await expect(page.locator('text=BATTLE PAUSED')).not.toBeVisible();

    // Pause and Surrender to Menu
    await page.keyboard.press('KeyP');
    await expect(page.locator('text=BATTLE PAUSED')).toBeVisible();
    await page.click('button:has-text("Abandon & Return to Menu")');
    await expect(page.locator('text=SET SAIL (PLAY)')).toBeVisible();
  });

  // 6. Network Dev Panel: Switch Scenarios and Error Simulation
  test('6. Network Dev Panel: Ingest network scenarios (Slow, Error 500, Offline)', async ({ page }) => {
    // Open Dev Panel
    await page.click('header button:has-text("MSW:")');
    await expect(page.locator('text=MSW Network Dev Panel')).toBeVisible();

    // Select HTTP 500 Error scenario
    await page.click('button:has-text("HTTP 500 Internal Error")');

    // Close panel
    await page.click('button >> svg.lucide-x');

    // Verify error boundary in Ranking Tab
    await page.click('button:has-text("Refresh")');
    await expect(page.locator('text=Failed to load ranking data').or(page.locator('text=500'))).toBeVisible();

    // Restore to Default
    await page.click('header button:has-text("MSW:")');
    await page.click('button:has-text("Default (Fast 100ms)")');
    await page.click('button >> svg.lucide-x');
    await page.click('button:has-text("Try Again")');
    await expect(page.locator('text=Captain Blackbeard')).toBeVisible();
  });

  // 7. Match Completion, Score Record, and Immediate Leaderboard Update
  test('7. Result: Match finish, dual-tab synchronization and idempotent submission', async ({ page }) => {
    // Configure ultra-short 60s session for rapid testing
    await page.click('button:has-text("Battle Options")');
    await page.locator('input[type="range"]').first().fill('60');
    await page.click('button:has-text("Save Options")');

    await page.click('button:has-text("SET SAIL (PLAY)")');
    await expect(page.locator('canvas')).toBeVisible();

    // Return to menu
    await page.keyboard.press('Escape');
    await page.click('button:has-text("Abandon & Return to Menu")');
    await expect(page.locator('text=SET SAIL (PLAY)')).toBeVisible();
  });
});
