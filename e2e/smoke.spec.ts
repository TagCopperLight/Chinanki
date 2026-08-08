import { expect, test } from '@playwright/test';

// Note: the default study-day rollover is 04:00 local time (see
// src/lib/db DEFAULT_SETTINGS / src/lib/time.ts startOfStudyDay). If this
// suite happens to run across the 03:59-04:01 window, the stats assertions
// below can observe a rollover mid-run and fail; that is an environment
// artifact, not a product bug.

test('create a deck, add a word, study it, and see it in the stats', async ({ page }) => {
  await page.goto('/');

  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill('E2E deck');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('E2E deck')).toBeVisible();

  await page.getByText('E2E deck').click();
  await page.getByRole('button', { name: 'Add word' }).click();
  await page.getByLabel('Hanzi').fill('好');
  await page.getByLabel('Pinyin').fill('hǎo');
  await page.getByLabel('Meaning').fill('good');
  await page.getByRole('button', { name: 'Save' }).click();

  // Two directions by default, so two cards.
  await expect(page.getByTestId('count-new')).toHaveText('2');

  await page.getByRole('button', { name: /Study/ }).click();
  await expect(page.getByTestId('prompt')).toContainText('好');
  await expect(page.getByTestId('answer')).toHaveCount(0);

  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('answer')).toBeVisible();
  await page.getByRole('button', { name: /Easy/ }).click();

  await page.getByRole('button', { name: 'Show answer' }).click();
  await page.getByRole('button', { name: /Easy/ }).click();
  await expect(page.getByText('All done')).toBeVisible();

  await page.getByRole('button', { name: 'Back to deck' }).click();
  await expect(page.getByText('Nothing due right now')).toBeVisible();

  await page.getByRole('link', { name: /Stats/ }).click();
  await expect(page.getByTestId('stat-today')).toHaveText('2');
  await expect(page.getByTestId('stat-streak')).toHaveText('1');
});

test('persists data across a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill('Persistent');
  await page.getByRole('button', { name: 'Create' }).click();
  // Wait for the create to actually land (async IndexedDB write) before
  // reloading, otherwise the reload can race the write.
  await expect(page.getByText('Persistent')).toBeVisible();

  await page.reload();
  await expect(page.getByText('Persistent')).toBeVisible();
});

test('registers a service worker so the app works offline', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Decks' })).toBeVisible();
  const registered = await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null;
  });
  expect(registered).toBe(true);
});
