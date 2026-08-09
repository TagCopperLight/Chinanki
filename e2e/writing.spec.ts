import { expect, test } from '@playwright/test';

test('draw a two-character word, reveal it, and rate it', async ({ page }) => {
  // Turning a direction off asks for confirmation, because it deletes cards.
  page.on('dialog', (dialog) => dialog.accept());

  await page.goto('/');
  await page.getByRole('button', { name: 'New deck' }).click();
  await page.getByLabel('Deck name').fill('Writing deck');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Writing deck')).toBeVisible();

  // Leave only the writing direction on, so the deck holds exactly one card.
  // Each toggle is written to IndexedDB and read back through a live query,
  // so the checkbox's controlled `checked` state lags the click by a tick —
  // .check()/.uncheck() verify synchronously and flake here, so click and
  // then wait for the checked state with a (polling) web assertion instead.
  await page.getByText('Writing deck').click();
  await page.getByRole('link', { name: 'Deck settings' }).click();
  const meaningToHanzi = page.getByRole('checkbox', { name: 'Meaning → 汉字' });
  await meaningToHanzi.click();
  await expect(meaningToHanzi).toBeChecked();
  const hanziToMeaning = page.getByRole('checkbox', { name: '汉字 → Meaning' });
  await hanziToMeaning.click();
  await expect(hanziToMeaning).not.toBeChecked();
  const hanziToPinyin = page.getByRole('checkbox', { name: '汉字 → Pinyin' });
  await hanziToPinyin.click();
  await expect(hanziToPinyin).not.toBeChecked();
  await page.goBack();

  await page.getByRole('button', { name: 'Add word' }).click();
  await page.getByLabel('Hanzi').fill('书店');
  await page.getByLabel('Pinyin').fill('shū diàn');
  await page.getByLabel('Meaning').fill('bookshop');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByTestId('count-new')).toHaveText('1');

  await page.getByRole('button', { name: /Study/ }).click();
  await expect(page.getByTestId('prompt')).toContainText('bookshop');
  await expect(page.getByTestId('writing-progress')).toHaveText('1 / 2');

  await drawDiagonal(page, 'Draw character 1 of 2');
  await expect(page.getByRole('button', { name: 'Undo stroke' })).toBeEnabled();

  await page.getByRole('button', { name: 'Next' }).click();
  await expect(page.getByTestId('writing-progress')).toHaveText('2 / 2');
  // The second box starts clean — one drawing must never leak into the next.
  await expect(page.getByRole('button', { name: 'Undo stroke' })).toBeDisabled();
  await drawDiagonal(page, 'Draw character 2 of 2');

  await page.getByRole('button', { name: 'Show answer' }).click();
  await expect(page.getByTestId('answer')).toContainText('书店');
  await expect(page.getByRole('img', { name: /Your drawing of/ })).toHaveCount(2);

  const overlay = page.getByRole('button', { name: 'Overlay' });
  await expect(overlay).toHaveAttribute('aria-pressed', 'true');
  await overlay.click();
  await expect(overlay).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: /Easy/ }).click();
  await expect(page.getByText('All done')).toBeVisible();
});

async function drawDiagonal(page: import('@playwright/test').Page, label: string) {
  const box = await page.getByRole('img', { name: label }).boundingBox();
  if (!box) throw new Error(`No drawing box for "${label}"`);
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.8, { steps: 10 });
  await page.mouse.up();
}
