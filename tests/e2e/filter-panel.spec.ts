import { expect, test } from '@playwright/test';

// A phone narrow enough to be below the 40rem breakpoint, and a laptop above it.
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 900 };

const panel = '[data-filter-panel]';

test.describe('the filter panel', () => {
  // Rendered open in the HTML, so a reader whose script never loads still gets
  // every control. Folding is an enhancement, not the baseline.
  test('is open in the markup when no script runs', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.route('**/*.js', (route) => route.abort());
    await page.goto('./');
    await expect(page.locator(panel)).toHaveAttribute('open', '');
  });

  // Stacked, the four controls pushed the first study off the first screen.
  test('is folded on a phone so a study is visible without scrolling', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./');
    await expect(page.locator(panel)).not.toHaveAttribute('open', '');
    await expect(page.locator('.story').first()).toBeInViewport();
  });

  test('stays open on a wide screen, where everything fits at once', async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await page.goto('./');
    await expect(page.locator(panel)).toHaveAttribute('open', '');
  });

  test('follows the breakpoint when an unfiltered window changes size', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./');
    await expect(page.locator(panel)).not.toHaveAttribute('open', '');

    await page.setViewportSize(LAPTOP);
    await expect(page.locator(panel)).toHaveAttribute('open', '');
    await expect(page.locator('#story-topic')).toBeVisible();

    await page.setViewportSize(PHONE);
    await expect(page.locator(panel)).not.toHaveAttribute('open', '');
  });

  test('stays open when a filter is selected before resizing to a phone', async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await page.goto('./');
    await page.locator('#story-topic').selectOption('trust');

    await page.setViewportSize(PHONE);
    await expect(page.locator(panel)).toHaveAttribute('open', '');
  });

  test('folds when the initial filter is cleared before resizing to a phone', async ({ page }) => {
    await page.setViewportSize(LAPTOP);
    await page.goto('./?topic=trust&category=all&region=all');
    await page.locator('#story-topic').selectOption('all');

    await page.setViewportSize(PHONE);
    await expect(page.locator(panel)).not.toHaveAttribute('open', '');
  });

  // Opening a filtered link with the panel shut would leave the reader looking
  // at a short list with nothing on screen saying why it is short.
  test('stays open on a phone when the link already carries a filter', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./?topic=trust&category=all&region=all');
    await expect(page.locator(panel)).toHaveAttribute('open', '');
  });

  // The toggle is the reader's way back to the controls, so it must be a real
  // control: reachable by keyboard and announced as one.
  test('opens from the keyboard once folded', async ({ page }) => {
    await page.setViewportSize(PHONE);
    await page.goto('./');
    const toggle = page.locator('.filters__toggle');
    await toggle.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator(panel)).toHaveAttribute('open', '');
    await expect(page.locator('#story-topic')).toBeVisible();
  });
});
