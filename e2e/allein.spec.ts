import { expect, test, type Page } from '@playwright/test';
import { createStack, expectAccessible, register, startLearning } from './helpers.ts';

/** Memo-Blitz: reads the open cards during the preview, then finds every pair at the first try. */
async function solveMemo(page: Page): Promise<void> {
  const cards = page.locator('.memo-card');
  await expect(cards.first()).toHaveAttribute('aria-label', /Karte 1: /);
  const labels = await cards.evaluateAll((list) => list.map((el) => el.getAttribute('aria-label') ?? ''));
  const symbols = labels.map((label) => label.replace(/^Karte \d+: /, ''));
  await expect(cards.first()).toHaveAttribute('aria-label', 'Karte 1, verdeckt', { timeout: 6000 });
  const done = new Set<number>();
  for (let i = 0; i < symbols.length; i++) {
    if (done.has(i)) continue;
    const j = symbols.findIndex((s, k) => k !== i && s === symbols[i]);
    await cards.nth(i).click();
    await cards.nth(j).click();
    done.add(i).add(j);
    await page.waitForTimeout(150);
  }
}

test('Allein spielen: Bereich im Tab «Spiele», Memo-Blitz mit Rekord, Spiele wählen per Tab', async ({ page }) => {
  await register(page, 'Lea');
  await page.getByRole('radiogroup', { name: 'Spielart' }).getByRole('radio', { name: 'Allein' }).click();
  await expect(page).toHaveURL('/allein');
  await expect(page.locator('.solo-tile')).toHaveCount(5);
  await expectAccessible(page);
  // The tab remembers the area.
  await page.locator('.tabbar a', { hasText: 'Konto' }).click();
  await page.locator('.tabbar a', { hasText: 'Spiele' }).click();
  await expect(page).toHaveURL('/allein');

  await page.locator('.solo-tile', { hasText: 'Memo-Blitz' }).click();
  await expect(page.getByRole('radiogroup', { name: 'Alter' }).getByRole('radio', { name: '6–9 Jahre' })).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page);
  // Coins are off: playing is free.
  await page.getByRole('button', { name: 'Spielen', exact: true }).click();
  await expect(page.locator('.memo-card')).toHaveCount(12);
  await solveMemo(page);
  await expect(page.getByText('Alle 6 Paare in 6 Zügen')).toBeVisible();
  await expect(page.getByText('Neuer Rekord für Lea!')).toBeVisible();
  await expect(page.locator('.solo-result__stars .is-on')).toHaveCount(3);
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Andere Spiele' }).click();
  await expect(page.locator('.solo-tile', { hasText: 'Memo-Blitz' }).locator('.solo-tile__best')).toBeVisible();

  // The other games start and can be left.
  for (const name of ['Phoni-Rennen', 'Farben-Fänger', 'Muster-Meister', 'Sortier-Rutsche']) {
    await page.locator('.solo-tile', { hasText: name }).click();
    await page.getByRole('button', { name: 'Spielen', exact: true }).click();
    await expect(page.locator('.gs')).toBeVisible();
    await page.getByRole('button', { name: 'Spiel beenden' }).click();
    await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();
    await expect(page.getByRole('button', { name: 'Spielen', exact: true })).toBeVisible();
    await page.goto('/allein');
  }
});

test('Belohnungen: Münzen ein, mit Code schützen, fürs Lernen verdienen und für Spiele ausgeben', async ({ page }) => {
  await register(page, 'Lea');
  await page.locator('.tabbar a', { hasText: 'Konto' }).click();
  await page.getByRole('link', { name: /Belohnungen/ }).click();
  await expect(page).toHaveURL('/belohnungen');
  await page.getByLabel('Münzen fürs Lernen').check();
  await expect(page.getByText('An – Spielen kostet Münzen.')).toBeVisible();
  await page.getByRole('button', { name: 'Eine Runde «Allein spielen»: weniger' }).click();
  await expect(page.getByRole('group', { name: 'Eine Runde «Allein spielen»' })).toContainText('4 Münzen');
  await expectAccessible(page);

  // A code: the settings are locked, a wrong code does not open them.
  await page.getByRole('button', { name: /Mit Code schützen/ }).click();
  await page.getByLabel('Neuer Code').fill('2468');
  await page.getByLabel('Code wiederholen').fill('2468');
  await page.getByRole('button', { name: 'Code speichern' }).click();
  await page.getByRole('button', { name: 'Wieder sperren' }).click();
  await expect(page.getByText('Mit Code geschützt')).toBeVisible();
  await page.getByLabel('Code').fill('1111');
  await page.getByRole('button', { name: 'Öffnen' }).click();
  await expect(page.getByText('Der Code stimmt nicht.')).toBeVisible();
  await page.getByLabel('Code').fill('2468');
  await page.getByRole('button', { name: 'Öffnen' }).click();
  await expect(page.getByRole('heading', { name: 'Kontostand' })).toBeVisible();

  // Nothing yet: playing needs coins.
  await page.goto('/allein/memo');
  await expect(page.getByRole('button', { name: 'Spielen · 4 🪙' })).toBeDisabled();
  await expect(page.getByText('Lea: 0 🪙 · es fehlen 4')).toBeVisible();

  // Learning earns them.
  await createStack(page, 'Einmaleins', ['7 × 8 = 56', '6 × 7 = 42', '9 × 9 = 81']);
  await startLearning(page);
  for (let i = 0; i < 3; i++) {
    await page.getByRole('button', { name: 'Antwort zeigen' }).click();
    await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  }
  await expect(page.getByText('+3 Münzen für Lea')).toBeVisible();

  // Parents give some more – after leaving, the settings are locked again.
  await page.goto('/belohnungen');
  await page.getByLabel('Code').fill('2468');
  await page.getByRole('button', { name: 'Öffnen' }).click();
  await page.getByRole('button', { name: 'Münzen für Lea ändern' }).click();
  await page.locator('.sheet').getByRole('button', { name: '+5', exact: true }).click();
  await expect(page.locator('.wallet-row', { hasText: 'Lea' }).locator('.coin-pill')).toHaveText('🪙 8');

  // A round costs 4; a faster car more than Lea has.
  await page.goto('/allein');
  await expect(page.getByText('Lea hat 8 Münzen')).toBeVisible();
  await page.locator('.solo-tile', { hasText: 'Phoni-Rennen' }).click();
  await page.getByRole('radio', { name: /Blitz/ }).click();
  await expect(page.getByText(/hat erst 8/)).toBeVisible();
  await page.locator('.sheet').getByRole('button', { name: 'OK' }).click();
  await page.getByRole('button', { name: 'Spielen · 4 🪙' }).click();
  await expect(page.locator('.gs')).toBeVisible();
  await page.getByRole('button', { name: 'Spiel beenden' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();
  await expect(page.getByText('Lea: 4 🪙')).toBeVisible();
});
