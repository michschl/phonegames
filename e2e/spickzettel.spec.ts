import { expect, test, type Page } from '@playwright/test';
import { createGroup, createStack, endGame, expectAccessible, openSettings, register, startGame } from './helpers.ts';

const TIMES = ['7 × 8 = 56', '6 × 7 = 42', '9 × 9 = 81', '12 × 12 = 144'];

/** Answers a Kartenkasten round by revealing; prompts in `wrong` are «Nicht gewusst» (also the second time). */
async function learnRound(page: Page, wrong: string[] = []): Promise<string> {
  await page.getByRole('button', { name: /Karten? lernen/ }).click();
  for (let i = 0; i < 30; i++) {
    if (await page.getByText(/von \d+ gewusst/).isVisible()) break;
    const prompt = (await page.locator('.learn-card__prompt').innerText()).trim();
    await page.getByRole('button', { name: 'Antwort zeigen' }).click();
    await page.getByRole('button', { name: wrong.includes(prompt) ? 'Nicht gewusst' : 'Gewusst', exact: true }).click();
  }
  const result = await page.locator('.result-banner__title').innerText();
  await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  return result;
}

test('Kartenkasten: selbst prüfen, Fächer und Erinnerung auf der Startseite', async ({ page }) => {
  await register(page, 'Nora');
  await createStack(page, 'Einmaleins', TIMES);
  await createGroup(page, ['Nora']);
  await startGame(page);
  await expect(page.locator('.box-row')).toBeVisible();
  // «7 × 8» is missed twice (asked again at the end of the round).
  expect(await learnRound(page, ['7 × 8'])).toBe('3 von 5 gewusst');
  await expect(page.getByText('Heute fällig: 1 Karte')).toBeVisible();
  await endGame(page);

  await page.goto('/');
  await expect(page.locator('.learn-due')).toContainText('Heute fällig: 1 Karte');
  await expect(page.locator('.learn-due')).toContainText('Einmaleins');
  await page.locator('.learn-due').click();
  await expect(page.locator('.stack-option.is-active')).toContainText('Einmaleins');
  await expect(page.getByRole('radio', { name: /Kartenkasten/ })).toHaveAttribute('aria-checked', 'true');
});

test('Kartenkasten: Antworten eintippen wird grosszügig geprüft', async ({ page }) => {
  const cards = { 'le chien': 'der Hund', heureux: 'glücklich', manger: 'essen', toujours: 'immer' } as Record<string, string>;
  const typed: Record<string, [string, string]> = {
    'le chien': ['Hund', 'is-almost'],
    heureux: ['gluecklich', 'is-almost'],
    manger: ['Essen', 'is-right'],
    toujours: ['nie', 'is-wrong'],
  };
  await register(page);
  await createStack(page, 'Tipp-Test', Object.entries(cards).map(([q, a]) => `${q} = ${a}`));
  await createGroup(page, ['Mia']);
  await openSettings(page);
  await page.getByRole('radio', { name: /Eintippen/ }).click();
  await startGame(page);
  await page.getByRole('button', { name: /Karten lernen/ }).click();
  const seen = new Set<string>();
  for (let i = 0; i < 8; i++) {
    if (await page.getByText(/von \d+ gewusst/).isVisible()) break;
    const prompt = (await page.locator('.learn-card__prompt').innerText()).trim();
    const [text, verdict] = seen.has(prompt) ? [cards[prompt]!, 'is-right'] : typed[prompt]!;
    seen.add(prompt);
    await page.getByLabel('Deine Antwort').fill(text);
    await page.getByLabel('Deine Antwort').press('Enter');
    await expect(page.locator('.typed-result'), prompt).toHaveClass(new RegExp(verdict));
    if (i === 0) await expectAccessible(page);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await expect(page.locator('.result-banner__title')).toHaveText('4 von 5 gewusst');
});

test('Namenstafeln und Badges zeigen, wer wie viele Karten fällig hat', async ({ page }) => {
  await register(page);
  await createStack(page, 'Einmaleins', TIMES);
  await createGroup(page, ['Lea', 'Ben', 'Mia']);
  await startGame(page);
  await expect(page.getByText('Wer lernt?')).toBeVisible();
  await page.locator('.pick-chip', { hasText: 'Lea' }).click();
  await learnRound(page);
  await page.getByRole('button', { name: 'Andere Person' }).click();
  await page.locator('.pick-chip', { hasText: 'Ben' }).click();
  await learnRound(page, ['7 × 8', '6 × 7']);
  await page.getByRole('button', { name: 'Andere Person' }).click();

  const tile = (name: string) => page.locator('.pick-chip', { hasText: name });
  await expect(tile('Lea')).toHaveClass(/tone-green/);
  await expect(tile('Lea').locator('.pick-chip__status')).toHaveText('Heute erledigt');
  await expect(tile('Ben')).toHaveClass(/tone-orange/);
  await expect(tile('Ben').locator('.due-badge')).toHaveText('2');
  await expect(tile('Mia').locator('.pick-chip__status')).toHaveText('Noch nicht begonnen');
  await expectAccessible(page);
  // On a narrow phone the corner badge sticks out of the tile, but not out of the screen area.
  await page.setViewportSize({ width: 360, height: 740 });
  const badge = (await tile('Ben').locator('.due-badge').boundingBox())!;
  const stage = (await page.locator('.gs-stage').boundingBox())!;
  expect(badge.x + badge.width).toBeLessThanOrEqual(stage.x + stage.width);
  await endGame(page);

  // Setup screen: player colours stay, Ben has the red badge, the group shows the sum.
  await expect(page.locator('.player-chip', { hasText: 'Ben' }).locator('.due-badge')).toHaveText('2');
  await expect(page.locator('.player-chip', { hasText: 'Lea' }).locator('.status-badge')).toHaveText('✓');
  await expect(page.locator('.group-pill.is-active .due-badge')).toHaveText('2');
  await expect(page.locator('.stack-option.is-active .due-pill')).toHaveText('2 fällig');
});

test('Stapelwahl: drei Vorschläge und «Anderer Stapel» mit Suche', async ({ page }) => {
  await register(page);
  for (const title of ['Unité 5', 'Kantone', 'Planeten', 'Bruchrechnen', 'Unité 6', 'Geschichte', 'Englisch']) {
    await createStack(page, title, ['eins = 1', 'zwei = 2', 'drei = 3', 'vier = 4']);
  }
  const suggested = page.locator('.stack-picker:not(.stack-chooser) .stack-option');
  await expect(suggested).toHaveCount(3);
  await page.getByRole('button', { name: 'Anderer Stapel (7)' }).click();
  await expect(page.locator('.stack-chooser .stack-option')).toHaveCount(7);
  await expectAccessible(page);
  await page.getByLabel('Stapel oder Fach suchen').fill('unite');
  await expect(page.locator('.stack-chooser .stack-option__title')).toHaveText(['Unité 5', 'Unité 6']);
  await page.getByLabel('Stapel oder Fach suchen').fill('');
  await page.locator('.stack-chooser .stack-option', { hasText: 'Kantone' }).click();
  await expect(page.locator('.sheet')).toHaveCount(0);
  await expect(suggested).toHaveCount(3);
  await expect(page.locator('.stack-option.is-active')).toContainText('Kantone');
});
