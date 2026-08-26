import { expect, test } from '@playwright/test';

const HOME = '/ai-people-weekly/';

test.describe('the open-access badge', () => {
  test('an unchecked story is never shown as paywalled', async ({ page }) => {
    await page.goto(HOME);
    const unknown = page.locator('.story__access-badge--unknown');
    const count = await unknown.count();
    for (let i = 0; i < count; i += 1) {
      await expect(unknown.nth(i)).toHaveText('未確認');
    }
    // Whatever the data says, no badge may read as subscription-required
    // unless the story is actually marked restricted.
    const restricted = page.locator('.story__access-badge--restricted');
    for (let i = 0; i < (await restricted.count()); i += 1) {
      await expect(restricted.nth(i)).toHaveText('需訂閱');
    }
  });

  test('every story keeps its original link next to whatever else it shows', async ({ page }) => {
    await page.goto(HOME);
    const stories = page.locator('.story');
    const count = await stories.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i += 1) {
      await expect(stories.nth(i).locator('.story__title a')).toHaveAttribute('href', /^https:\/\//);
    }
  });

  // A free copy usually sits in a third-party repository. The reader should be
  // able to see where the link goes before following it.
  test('a free link names the host it points at', async ({ page }) => {
    await page.goto(HOME);
    const freeLinks = page.locator('.story__access a');
    for (let i = 0; i < (await freeLinks.count()); i += 1) {
      await expect(freeLinks.nth(i).locator('.story__access-host')).toContainText(/\(.+\)/);
    }
  });

  test('the badge is present on every story, in both languages', async ({ page }) => {
    for (const path of [HOME, '/ai-people-weekly/en/']) {
      await page.goto(path);
      const stories = await page.locator('.story').count();
      const badges = await page.locator('.story__access-badge').count();
      expect(badges).toBe(stories);
    }
  });
});
