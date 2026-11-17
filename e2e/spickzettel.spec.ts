import { expect, test, type Page } from '@playwright/test';
import { addLearner, createStack, endGame, expectAccessible, openMode, register, startLearning, undo } from './helpers.ts';

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
  // With cards still due it goes on; when everything is done the round ends with «Fertig».
  const next = page.getByRole('button', { name: 'Weiter', exact: true });
  if (await next.isVisible()) await next.click();
  return result;
}

test('Lernen: Einführung, Stapelseite, allein ohne Gruppe, Badge auf dem Tab und ein Tipp bis zur Karte', async ({ page }) => {
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

  // The start page has no learning rows – the «Lernen» tab shows the cards due as a badge.
  await page.goto('/');
  await expect(page.locator('.learn-due__row')).toHaveCount(0);
  const tab = page.locator('.tabbar a[href="/lernen"]');
  await expect(tab.locator('.tabbar__badge')).toHaveText('1');
  await expect(tab).toHaveAccessibleName('Lernen, 1 Karte fällig');
  await expectAccessible(page);
  // In «Lernen»: one tap to the card that is due.
  await tab.click();
  const row = page.locator('.learn-due__row');
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('Nora');
  await expect(row).toContainText('1 Karte · «Einmaleins»');
  await expect(page.locator('.group-card', { hasText: 'Einmaleins' }).locator('.due-pill')).toHaveText('1 fällig');
  await expectAccessible(page);
  await row.click();
  await expect(page.locator('.learn-card__prompt')).toHaveText('7 × 8');
  await page.getByRole('button', { name: 'Antwort zeigen' }).click();
  await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  await expect(page.locator('.result-banner__title')).toHaveText('1 von 1 gewusst');
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page).toHaveURL(/\/lernen$/);
  // Nothing due any more: no badge.
  await expect(tab.locator('.tabbar__badge')).toHaveCount(0);
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

test('Wörtli: vor der Runde wählen, was gezeigt wird – wie erfasst, umgekehrt oder gemischt', async ({ page }) => {
  const cards: Record<string, string> = { 'le chien': 'der Hund', 'la maison': 'das Haus', 'le chat': 'die Katze', manger: 'essen' };
  const french = Object.keys(cards);
  const back = Object.fromEntries(Object.entries(cards).map(([fr, de]) => [de, fr]));
  await register(page);
  await createStack(page, 'Richtung', Object.entries(cards).map(([q, a]) => `${q} = ${a}`));

  // Typed cards do not know their languages: «Normal» is as entered, explained with a card of the stack.
  const direction = page.getByRole('radiogroup', { name: 'Abfragen' });
  await expect(direction.getByRole('radio', { name: 'Normal' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Wie erfasst: «le chien» → «der Hund»')).toBeVisible();
  await direction.getByRole('radio', { name: 'Umgekehrt' }).click();
  await expect(page.getByText('Umgekehrt: «der Hund» → «le chien»')).toBeVisible();
  await expectAccessible(page);

  // The other way round: the German word is shown, the French one is typed.
  await page.getByRole('radio', { name: 'Tippen' }).click();
  await startLearning(page);
  for (let i = 0; i < 4; i++) {
    const prompt = (await page.locator('.learn-card__prompt').innerText()).trim();
    expect(Object.keys(back)).toContain(prompt);
    await page.getByLabel('Deine Antwort').fill(back[prompt]!);
    await page.getByLabel('Deine Antwort').press('Enter');
    await expect(page.locator('.typed-result')).toHaveClass(/is-right/);
    await page.getByRole('button', { name: 'Weiter', exact: true }).click();
  }
  await expect(page.locator('.result-banner__title')).toHaveText('4 von 4 gewusst');
  await endGame(page);

  // Mixed: half of the cards each way. Nothing is due any more – a practice round.
  await expect(direction.getByRole('radio', { name: 'Umgekehrt' })).toHaveAttribute('aria-checked', 'true');
  await direction.getByRole('radio', { name: 'Gemischt' }).click();
  await page.getByRole('radio', { name: 'Aufdecken' }).click();
  await startLearning(page);
  const prompts: string[] = [];
  for (let i = 0; i < 4; i++) {
    prompts.push((await page.locator('.learn-card__prompt').innerText()).trim());
    await page.getByRole('button', { name: 'Antwort zeigen' }).click();
    await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  }
  expect(prompts.filter((p) => french.includes(p))).toHaveLength(2);
  expect(prompts.filter((p) => p in back)).toHaveLength(2);
  await endGame(page);

  // Playing together uses the same choice, and it can be changed right there.
  await openMode(page, /Duell/);
  await expect(page.getByRole('radiogroup', { name: 'Abfragen' }).getByRole('radio', { name: 'Gemischt' })).toHaveAttribute('aria-checked', 'true');
});

test('Wer lernt? Personen entfernen, mit «Rückgängig» zurückholen und wieder hinzufügen', async ({ page }) => {
  await register(page, 'Lea');
  await createStack(page, 'Entfernen', TIMES);
  await addLearner(page, 'Ben');
  await startLearning(page);
  await learnRound(page, ['7 × 8']);
  await endGame(page);
  await addLearner(page, 'Mia');
  const tile = (name: string) => page.getByRole('radio', { name: new RegExp(`^${name}`) });
  await expect(tile('Ben').locator('.due-badge')).toHaveText('1');

  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await expect(page.getByText('Tippe eine Person an, um sie aus diesem Stapel zu entfernen.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Person hinzufügen' })).toHaveCount(0);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Ben entfernen' }).click();
  await expect(page.locator('.toast', { hasText: 'Ben entfernt.' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Ben entfernen' })).toHaveCount(0);
  await undo(page);
  await expect(page.getByRole('button', { name: 'Ben entfernen' })).toBeVisible();
  await page.getByRole('button', { name: 'Mia entfernen' }).click();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await expect(tile('Mia')).toHaveCount(0);
  // «Rückgängig» brought back the Kartenkasten too.
  await expect(tile('Ben').locator('.due-badge')).toHaveText('1');

  // Gone for good on this stack, and back as soon as the name is added again.
  await page.reload();
  await expect(tile('Lea')).toBeVisible();
  await expect(tile('Mia')).toHaveCount(0);
  await addLearner(page, 'Mia');
  await expect(tile('Mia').locator('.learner-tile__status')).toHaveText('Noch nicht begonnen');

  // Removing deletes the Kartenkasten for this stack: no more cards due, a fresh start when added again.
  await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click();
  await page.getByRole('button', { name: 'Ben entfernen' }).click();
  await page.getByRole('button', { name: 'Fertig', exact: true }).click();
  await page.goto('/lernen');
  await expect(page.locator('.tabbar a[href="/lernen"] .tabbar__badge')).toHaveCount(0);
  await expect(page.locator('.group-card', { hasText: 'Entfernen' }).locator('.due-pill')).toHaveCount(0);
  await page.locator('.group-card', { hasText: 'Entfernen' }).click();
  await addLearner(page, 'Ben');
  await expect(tile('Ben').locator('.learner-tile__status')).toHaveText('Noch nicht begonnen');
});

test('Wer lernt? Namenstafeln zeigen, wer wie viele Karten fällig hat', async ({ page }) => {
  await register(page, 'Lea');
  await createStack(page, 'Einmaleins', TIMES);
  await startLearning(page);
  await learnRound(page);
  // Everything known: the round says when it goes on and suggests playing together.
  await expect(page.locator('.all-done')).toContainText('Alles erledigt für heute');
  await expect(page.locator('.all-done')).toContainText('Die nächsten 4 Karten sind morgen dran.');
  await expect(page.getByRole('link', { name: /Duell zu zweit/ })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Fertig' }).click();
  await expect(page).toHaveURL(/\/lernen\/[^/]+$/);
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

test('Lernen: fällige Stapel zuerst, Suche ab sieben Stapeln, der alte Startbildschirm führt hierher', async ({ page }) => {
  await register(page, 'Lea');
  for (const title of ['Unité 5', 'Kantone', 'Planeten', 'Bruchrechnen', 'Unité 6', 'Geschichte', 'Englisch']) {
    await createStack(page, title, ['eins = 1', 'zwei = 2', 'drei = 3', 'vier = 4']);
  }
  // «Planeten» has a card due again – it comes first, then the most recent stacks.
  await page.goto('/lernen');
  await page.locator('.group-card', { hasText: 'Planeten' }).click();
  await startLearning(page);
  await learnRound(page, ['eins']);
  await endGame(page);
  await page.goto('/lernen');
  await expect(page.locator('.group-card__name').first()).toHaveText('Planeten');
  await expect(page.locator('.group-card__name').nth(1)).toHaveText('Englisch');
  await page.getByLabel('Stapel oder Fach suchen').fill('unite');
  await expect(page.locator('.group-card__name')).toHaveText(['Unité 6', 'Unité 5']);
  // «So geht’s» explains Lernen in five steps – a section of its own, like «Heute dran» and «Stapel».
  await expect(page.locator('.section__title')).toContainText(['Heute dran', 'So geht’s', 'Stapel']);
  await page.locator('summary', { hasText: 'In fünf Schritten' }).click();
  await expect(page.locator('.rules li')).toHaveCount(5);
  await expectAccessible(page);
  // A new stack is always where the stacks are: next to the heading of a long list and at its end.
  await expect(page.locator('.section__head', { hasText: 'Stapel' }).getByRole('link', { name: 'Neuer Stapel' })).toBeVisible();
  await page.getByLabel('Stapel oder Fach suchen').fill('');
  const add = page.locator('.stack-add');
  await add.scrollIntoViewIfNeeded();
  await expect(add).toContainText('Foto aufnehmen oder Karten abtippen');
  await add.click();
  await expect(page).toHaveURL(/\/stapel\/neu$/);
  await page.goBack();
  // The setup screen of the game is gone: it leads to «Lernen».
  await page.goto('/spiel/spickzettel');
  await expect(page).toHaveURL(/\/lernen$/);
  await expect(page.locator('h1')).toHaveText('Lernen');
});

/** progressId() of the app: FNV-1a over the normalised name. */
function progressId(stackId: string, player: string): string {
  let hash = 0x811c9dc5;
  for (const char of player.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `p-${stackId}-${hash.toString(36)}`;
}

test('Lernserie: Tage in Folge auf der Namenstafel und nach der Runde, Duell gegen die andere Person', async ({ page }) => {
  await register(page, 'Lea');
  await createStack(page, 'Einmaleins', TIMES);
  const stackId = page.url().split('/').pop()!;
  // Lea learned yesterday and the day before (on another phone) – Ben learns this stack too, both are in a group.
  const day = (offset: number) => {
    const date = new Date(Date.now() + offset * 24 * 60 * 60 * 1000);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  // The new stack reaches the server in the background.
  let stack: { cards: { id: string }[] } | undefined;
  await expect
    .poll(async () => {
      stack = (await (await page.request.get('/api/account/export')).json()).learnStacks[0];
      return stack?.cards.length ?? 0;
    })
    .toBe(4);
  const card = (id: string) => ({ box: 2, due: Date.now() - 1000, id });
  const cards = Object.fromEntries(stack!.cards.map((c) => [c.id, { box: card(c.id).box, due: card(c.id).due }]));
  const now = Date.now();
  const res = await page.request.post('/api/sync', {
    headers: { 'X-Requested-With': 'phonegames' },
    data: {
      library: [],
      groups: [
        {
          id: 'group-familie-1',
          name: 'Familie',
          emoji: '🏡',
          players: [
            { id: 'player-lea-01', name: 'Lea', color: '#ff3d8b' },
            { id: 'player-ben-01', name: 'Ben', color: '#5b8cff' },
          ],
          createdAt: now,
          updatedAt: now,
          deleted: false,
        },
      ],
      stacks: [],
      progress: [
        { id: progressId(stackId, 'Lea'), stackId, player: 'Lea', cards, days: [day(-2), day(-1)], updatedAt: now, deleted: false },
        { id: progressId(stackId, 'Ben'), stackId, player: 'Ben', cards, days: [day(-1)], updatedAt: now - 1, deleted: false },
      ],
    },
  });
  expect(res.ok()).toBe(true);
  await page.reload();
  await expect(page.getByRole('radio', { name: /^Lea/ }).locator('.streak')).toContainText('🔥2');
  await expect(page.getByRole('radio', { name: /^Ben/ }).locator('.streak')).toHaveCount(0);
  await page.getByRole('radio', { name: /^Lea/ }).click();
  await startLearning(page);
  await learnRound(page);
  await expect(page.locator('.streak-note')).toHaveText('🔥 3 Tage in Folge gelernt – weiter so!');
  // Ben learns the same stack and is in the same group: the Duell is suggested against him.
  await page.getByRole('link', { name: 'Duell gegen Ben' }).click();
  await expect(page).toHaveURL(/\/lernen\/[^/]+\/duell\?gruppe=/);
  await expect(page.locator('.group-pill.is-active')).toContainText('Familie');
  await expect(page.locator('.start-bar .btn')).toHaveText('Duell starten · 2 Personen');
});

