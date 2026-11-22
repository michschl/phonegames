import { expect, test } from '@playwright/test';
import { expectAccessible, register } from './helpers.ts';

test('Arena: 3D-Spiele ab 13, Familien-Rangliste, Kugelbahn-Level und Ausblenden durch Eltern', async ({ page }) => {
  await register(page, 'Lea');
  const areas = page.getByRole('radiogroup', { name: 'Spielart' });
  await expect(areas.getByRole('radio')).toHaveText(['Zusammen', 'Allein', 'Arena']);
  await areas.getByRole('radio', { name: 'Arena' }).click();
  await expect(page).toHaveURL('/arena');
  await expect(page.locator('.arena-tile')).toHaveCount(4);
  await expectAccessible(page);

  // Another person of the family already has a record in the Raumdenker.
  const wallet = { id: 'learner-tim', learner: 'Tim', earned: {}, spent: {}, history: [], unlocks: [], best: { raum: 5000 }, updatedAt: Date.now() - 1000, deleted: false };
  expect((await page.request.post('/api/sync', { headers: { 'X-Requested-With': 'phonegames' }, data: { library: [], groups: [], wallets: [wallet] } })).status()).toBe(200);

  // Raumdenker: twelve tasks, then the result with the family leaderboard.
  await page.reload();
  await page.locator('.arena-tile', { hasText: 'Raumdenker' }).click();
  await expect(page.getByRole('list', { name: 'Rangliste der Familie' })).toContainText('Tim');
  await expectAccessible(page);
  await page.getByRole('button', { name: /^Spielen/ }).click();
  for (let i = 1; i <= 12; i++) {
    await expect(page.locator('.gs__label')).toHaveText(`Aufgabe ${i} von 12`);
    await page.locator('.raum-option').first().click();
  }
  await expect(page.locator('.solo-result__score')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Platz 2 von 2 in der Familie')).toBeVisible();
  const ranking = page.getByRole('list', { name: 'Rangliste der Familie' });
  await expect(ranking.locator('.ranking__row')).toHaveCount(2);
  await expect(ranking.locator('.ranking__row.is-me')).toContainText('Lea');

  // Kugelbahn: level 1 straight down to the goal (arrow key), then level 2 is open.
  await page.goto('/arena/kugel');
  await expect(page.getByRole('radio', { name: 'Level 2, noch gesperrt' })).toBeDisabled();
  await page.getByRole('button', { name: /Level 1 spielen/ }).click();
  // Once the clock runs (after loading and the countdown), roll down.
  await expect(page.locator('.arena-hud')).not.toContainText('0.0', { timeout: 15_000 });
  await page.keyboard.down('ArrowDown');
  await expect(page.getByText(/Geschafft!/)).toBeVisible({ timeout: 8000 });
  await page.keyboard.up('ArrowDown');
  await expect(page.getByRole('button', { name: 'Level 2' })).toBeVisible({ timeout: 6000 });
  await page.getByRole('link', { name: 'Arena' }).click();
  await page.locator('.arena-tile', { hasText: 'Kugelbahn' }).click();
  await expect(page.getByRole('radio', { name: 'Level 1, geschafft' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Level 2', exact: true })).toBeEnabled();

  // Pistenjagd and Beat-Bahn start and can be left.
  for (const name of ['Pistenjagd', 'Beat-Bahn']) {
    await page.goto('/arena');
    await page.locator('.arena-tile', { hasText: name }).click();
    await page.getByRole('button', { name: /^Spielen/ }).click();
    await expect(page.locator('.arena-canvas')).toBeVisible();
    await page.getByRole('button', { name: 'Spiel beenden' }).click();
    await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();
    await expect(page.getByRole('button', { name: /^Spielen/ })).toBeVisible();
  }

  // Parents hide the Arena.
  await page.goto('/belohnungen');
  await page.getByLabel('Arena anzeigen').uncheck();
  await page.goto('/allein');
  await expect(areas.getByRole('radio')).toHaveText(['Zusammen', 'Allein']);
  await page.goto('/arena');
  await expect(page).toHaveURL('/allein');
});
