import { expect, test, type Page } from '@playwright/test';
import { addLearner, createStack, endGame, expectAccessible, register, startLearning } from './helpers.ts';

const TIMES = ['7 × 8 = 56', '6 × 7 = 42', '9 × 9 = 81', '12 × 12 = 144'];

/**
 * Answers a Kartenkasten round by revealing; prompts in `wrong` are «Nicht gewusst» (also the second time).
 * A round started from «Wer lernt?» or «Heute fällig» begins with the first card right away.
 */
async function learnRound(page: Page, wrong: string[] = []): Promise<string> {
  const start = page.getByRole('button', { name: /Karten? lernen/ });
  if (await start.isVisible()) await start.click();
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

test('Lernen: Einführung, Stapelseite, allein ohne Gruppe und ein Tipp von der Startseite', async ({ page }) => {
  await register(page, 'Nora');
  await page.locator('.tabbar a[href="/lernen"]').click();
  await expect(page.locator('.learn-intro__steps li')).toHaveCount(3);
  await expectAccessible(page);
  await createStack(page, 'Einmaleins', TIMES);
  // Alone, no group: «Wer lernt?» knows the account holder, the button says what happens.
  await expect(page.getByRole('radio', { name: /^Nora/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('.learn-panel__status')).toHaveText('4 neue Karten');
  await expect(page.locator('.start-bar a')).toHaveText('4 Karten lernen · Nora');
  await expectAccessible(page);
  await startLearning(page);
  // Straight to the first card – no overview in between.
  await expect(page.locator('.learn-card')).toBeVisible();
  // «7 × 8» is missed twice (asked again at the end of the round).
  expect(await learnRound(page, ['7 × 8'])).toBe('3 von 5 gewusst');
  await expect(page.locator('.box-row')).toBeVisible();
  await expect(page.getByText('Heute fällig: 1 Karte')).toBeVisible();
  // The numbers of all boxes stand on one line – also on a small phone, where the labels wrap.
  for (const width of [280, 412]) {
    await page.setViewportSize({ width, height: 839 });
    const tops = await page.locator('.box-col strong').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().top)));
    expect(new Set(tops).size, `${width} px`).toBe(1);
  }
  await endGame(page);
  await expect(page).toHaveURL(/\/lernen\/[^/]+$/);
  await expect(page.locator('.learn-panel__status')).toHaveText('Heute fällig: 1 Karte');

  // The start page and the «Lernen» tab: one tap to the card that is due.
  await page.goto('/');
  const row = page.locator('.learn-due__row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Nora');
  await expect(row).toContainText('1 Karte · «Einmaleins»');
  await expectAccessible(page);
  await row.click();
  await expect(page.locator('.learn-card__prompt')).toHaveText('7 × 8');
  await endGame(page);
  await expect(page).toHaveURL('/');
  await page.goto('/lernen');
  await expect(page.locator('.learn-due__row')).toContainText('Nora');
  await expect(page.locator('.group-card', { hasText: 'Einmaleins' }).locator('.due-pill')).toHaveText('1 fällig');
  await expectAccessible(page);
});

test('Kartenkasten: Antwortart pro Person, Eintippen wird grosszügig geprüft', async ({ page }) => {
  const cards = { 'le chien': 'der Hund', heureux: 'glücklich', manger: 'essen', toujours: 'immer' } as Record<string, string>;
  const typed: Record<string, [string, string]> = {
    'le chien': ['Hund', 'is-almost'],
    heureux: ['gluecklich', 'is-almost'],
    manger: ['Essen', 'is-right'],
    toujours: ['nie', 'is-wrong'],
  };
  await register(page);
  await createStack(page, 'Tipp-Test', Object.entries(cards).map(([q, a]) => `${q} = ${a}`));
  await page.getByRole('radio', { name: 'Tippen' }).click();
  await startLearning(page);
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
  await endGame(page);
  // Typing belongs to Lea – Ben answers his own way.
  await expect(page.getByRole('radio', { name: 'Tippen' })).toHaveAttribute('aria-checked', 'true');
  await addLearner(page, 'Ben');
  await expect(page.getByRole('radio', { name: 'Aufdecken' })).toHaveAttribute('aria-checked', 'true');
});

test('Wer lernt? Namenstafeln zeigen, wer wie viele Karten fällig hat', async ({ page }) => {
  await register(page, 'Lea');
  await createStack(page, 'Einmaleins', TIMES);
  await startLearning(page);
  await learnRound(page);
  await endGame(page);
  await addLearner(page, 'Ben');
  await startLearning(page);
  await learnRound(page, ['7 × 8', '6 × 7']);
  await endGame(page);
  await addLearner(page, 'Mia');

  const tile = (name: string) => page.getByRole('radio', { name: new RegExp(`^${name}`) });
  await expect(tile('Lea')).toHaveClass(/tone-green/);
  await expect(tile('Lea').locator('.learner-tile__status')).toHaveText('Heute erledigt');
  await expect(tile('Lea').locator('.status-badge')).toHaveText('✓');
  await expect(tile('Ben')).toHaveClass(/tone-orange/);
  await expect(tile('Ben').locator('.due-badge')).toHaveText('2');
  await expect(tile('Mia').locator('.learner-tile__status')).toHaveText('Noch nicht begonnen');
  await expectAccessible(page);
  // On a narrow phone the corner badge sticks out of the tile, but stays on the screen.
  await page.setViewportSize({ width: 360, height: 740 });
  const badge = (await tile('Ben').locator('.due-badge').boundingBox())!;
  expect(badge.x + badge.width).toBeLessThanOrEqual(360 - 8);
  await page.goto('/lernen');
  await expect(page.locator('.group-card', { hasText: 'Einmaleins' }).locator('.due-pill')).toHaveText('2 fällig');
});

test('Stapelwahl: drei Vorschläge und «Anderer Stapel» mit Suche', async ({ page }) => {
  await register(page);
  for (const title of ['Unité 5', 'Kantone', 'Planeten', 'Bruchrechnen', 'Unité 6', 'Geschichte', 'Englisch']) {
    await createStack(page, title, ['eins = 1', 'zwei = 2', 'drei = 3', 'vier = 4']);
  }
  // Playing together: the setup screen suggests stacks.
  await page.goto('/spiel/spickzettel');
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
