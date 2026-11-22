import { expect, test } from '@playwright/test';
import { createGroup, register } from './helpers.ts';

test('Gemeinschaftsspiele: Punkte pro Person zählen für die Rangliste der Familie', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/spiel/wahrheit-oder-pflicht');
  await expect(page.getByText('Noch keine Partie gezählt.')).toBeHidden();
  await createGroup(page, ['Lea', 'Tim']);
  await page.getByRole('button', { name: /Spiel starten/ }).click();

  // Round 1: done (a point), round 2: chickened out.
  for (const done of [true, false]) {
    await page.getByRole('button', { name: /Wahrheit$/ }).click({ timeout: 15_000 });
    await page.getByRole('button', { name: done ? /Geschafft/ : /Gekniffen/ }).click();
  }
  await page.getByRole('button', { name: 'Spiel beenden' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();

  // Back on the setup screen: the family leaderboard of this game.
  await expect(page).toHaveURL('/spiel/wahrheit-oder-pflicht');
  await page.getByText('Rangliste der Familie').click();
  const rows = page.getByRole('list', { name: 'Rangliste der Familie' }).locator('.ranking__row');
  await expect(rows).toHaveCount(2);
  await expect(rows.first()).toContainText('1 Pkt.');
  await expect(rows.first()).toContainText('1 Sieg');
  await expect(rows.nth(1)).toContainText('0 Pkt.');
  await expect(rows.nth(1)).toContainText('1 Partie');
});
