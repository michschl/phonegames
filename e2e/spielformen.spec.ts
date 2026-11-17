import { expect, test, type Locator } from '@playwright/test';
import { createGroup, createStack, endGame, expectAccessible, openMode, register, startGame } from './helpers.ts';

const WORDS: Record<string, string> = { 'le chien': 'der Hund', 'la maison': 'das Haus', manger: 'essen', toujours: 'immer' };

test('Duell: falscher Tipp sperrt, wer zuerst richtig tippt, punktet', async ({ page }) => {
  await register(page);
  await createStack(page, 'Wörtli', Object.entries(WORDS).map(([q, a]) => `${q} = ${a}`));
  // From the stack page straight to «Wer spielt mit?» – stack and mode are already chosen.
  await openMode(page, /Duell/);
  await expect(page).toHaveURL(/\/lernen\/[^/]+\/duell$/);
  await expect(page.locator('h1')).toHaveText('⚔️ Duell');
  await expect(page.locator('.page__subtitle')).toHaveText('«Wörtli» · zu zweit');
  await createGroup(page, ['Lea', 'Ben', 'Carla']);
  await expectAccessible(page);
  await page.locator('.start-bar .btn').click();
  await expect(page.getByText('Wer spielt gegeneinander?')).toBeVisible();
  await page.locator('.pick-chip', { hasText: 'Lea' }).click();
  await page.locator('.pick-chip', { hasText: 'Ben' }).click();
  await page.getByRole('button', { name: 'Lea gegen Ben' }).click();
  await page.getByRole('button', { name: 'Duell starten' }).click();
  await expect(page.locator('.duel')).toBeVisible({ timeout: 8000 });

  const top = page.locator('.duel__side--top');
  const bottom = page.locator('.duel__side--bottom');
  const option = (side: Locator, text: string) => side.locator('.duel__option', { hasText: new RegExp(`^${text}$`) });
  let missed = '';
  for (let i = 0; i < 4; i++) {
    const prompt = (await bottom.locator('.duel__prompt').innerText()).trim();
    const right = WORDS[prompt]!;
    if (i === 0) {
      // Lea (top half, upside down) taps a wrong answer: her side locks, Ben can still win.
      missed = prompt;
      await top.locator('.duel__option').filter({ hasNotText: new RegExp(`^${right}$`) }).first().dispatchEvent('pointerdown');
      await expect(page.locator('.duel__side--top.is-locked')).toBeVisible();
      await expectAccessible(page);
    }
    await option(bottom, right).dispatchEvent('pointerdown');
    await expect(bottom.locator('.duel__option.is-right')).toBeVisible();
    if (i < 3) await expect(bottom.locator('.duel__prompt')).not.toHaveText(prompt, { timeout: 5000 });
  }
  await expect(page.locator('.result-banner')).toBeVisible({ timeout: 5000 });
  await expect(page.locator('.result-banner')).toContainText('Ben');
  await expect(page.locator('.turn-list')).toContainText(missed);
});

test('Blitzrunde: wer abfragt, sieht Frage und Antwort', async ({ page }) => {
  await register(page);
  await createStack(page, 'Wörtli', Object.entries(WORDS).map(([q, a]) => `${q} = ${a}`));
  await openMode(page, /Blitzrunde/);
  await createGroup(page, ['Lea', 'Ben', 'Carla', 'Dario']);
  await startGame(page);
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await page.getByRole('button', { name: /^Ich bin / }).click();
  await page.getByRole('button', { name: 'Start' }).click();
  const card = page.locator('.learn-card--quiz');
  await expect(card).toBeVisible({ timeout: 10_000 });
  const prompt = (await card.locator('.learn-card__prompt').innerText()).trim();
  await expect(card.locator('.learn-card__answer')).toContainText(WORDS[prompt]!);
  await page.getByRole('button', { name: 'Gewusst', exact: true }).click();
  await endGame(page);
});

test('Schätzrunde: Volltreffer punkten, weit daneben landet im Kartenkasten', async ({ page }) => {
  const answers: Record<string, number> = {
    'Gründung der Eidgenossenschaft': 1291,
    'Höhe des Matterhorns': 4478,
    'Anzahl Kantone der Schweiz': 26,
    'Schlacht am Morgarten': 1315,
  };
  await register(page);
  await createStack(page, 'Schweizer Geschichte', [...Object.entries(answers).map(([q, a]) => `${q} = ${a}`), 'le chien = der Hund']);
  // Only what fits the stack is offered: numbers, but no gaps.
  await expect(page.locator('.mode-row', { hasText: /Lückentext/ })).toHaveCount(0);
  await openMode(page, /Schätzrunde/);
  await createGroup(page, ['Lea', 'Ben']);
  // A small phone: the reveal does not fit and scrolls.
  await page.setViewportSize({ width: 360, height: 520 });
  await startGame(page);

  for (let q = 0; q < 4; q++) {
    const prompt = (await page.locator('.gs-card__text').first().innerText()).trim();
    const answer = answers[prompt]!;
    await page.getByRole('button', { name: 'Schätzen', exact: true }).click();
    for (const [name, guess] of [['Lea', answer], ['Ben', answer * 3]] as const) {
      await page.getByRole('button', { name: `Ich bin ${name}` }).click();
      await page.getByLabel('Deine Schätzung').fill(String(guess));
      await page.getByRole('button', { name: 'Schätzung abgeben' }).click();
    }
    const list = page.locator('.guess-list');
    await expect(list).toBeVisible({ timeout: 8000 });
    await expect(list.locator('li').first()).toContainText('Volltreffer');
    await expect(list.locator('li', { hasText: 'Ben' })).toContainText('Daneben');
    await expect(page.locator('.number-line')).toBeVisible();
    if (q === 0) {
      // Rows stay on the screen, and the pins stay below the answer instead of sliding over it.
      for (const right of await list.locator('li').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) {
        expect(right).toBeLessThanOrEqual(360);
      }
      const shown = (await page.locator('.countup').boundingBox())!;
      const pins = await page.locator('.number-line__marker').evaluateAll((els) => Math.min(...els.map((e) => e.getBoundingClientRect().top)));
      expect(pins).toBeGreaterThanOrEqual(shown.y + shown.height);
      await expectAccessible(page);
    }
    await page.getByRole('button', { name: /Nächste Frage|Zur Schlussrangliste/ }).click();
  }
  await expect(page.getByText('Das beste Schätzauge')).toBeVisible();
  await expect(page.locator('.score-list li').first()).toContainText('Lea');
  await expect(page.locator('.turn-list li')).toHaveCount(4);
  await page.getByRole('button', { name: 'Beenden', exact: true }).click();

  // After the game «Wer spielt mit?» is ready for another round; back to the stack page:
  // Ben's far-off guesses are now due in his Kartenkasten.
  await expect(page).toHaveURL(/\/lernen\/[^/]+\/schaetzen$/);
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  await expect(page.locator('h1')).toHaveText('Schweizer Geschichte');
  await expect(page.getByRole('radio', { name: /^Ben/ }).locator('.due-badge')).toHaveText('4');
});

test('Lückentext: Wortbank, Korrektur und Eintippen', async ({ page }) => {
  const answer: Record<string, string> = {
    Kantone: '26',
    Hauptstadt: 'Bern',
    Basel: 'Rhein',
    Berg: 'Dufourspitze',
    See: 'Neuenburgersee',
    Tessin: 'Italienisch',
  };
  const answerFor = (sentence: string) => Object.entries(answer).find(([key]) => sentence.includes(key))![1];
  await register(page);
  await createStack(page, 'Schweiz NMG', [
    'Die Schweiz hat [26] Kantone.',
    'Die Hauptstadt der Schweiz ist [Bern].',
    'Der [Rhein] fliesst durch Basel.',
    'Der höchste Berg der Schweiz ist die [Dufourspitze].',
    'Der grösste See ganz in der Schweiz ist der [Neuenburgersee].',
    'Im Tessin spricht man [Italienisch].',
  ]);
  // Alone, without a group: straight to the first page.
  await openMode(page, /Lückentext/);
  await expect(page).toHaveURL(/\/luecke\?person=Lea$/);

  // Page 1: everything right; a filled gap gives its word back when tapped.
  const sentences = async () => {
    await expect(page.locator('.cloze-sentence')).toHaveCount(3);
    return page.locator('.cloze-sentence').allInnerTexts();
  };
  let list = await sentences();
  const first = answerFor(list[0]!);
  await page.locator('.word-chip', { hasText: first }).click();
  await page.locator('.cloze-gap').first().click();
  await expect(page.locator('.word-chip', { hasText: first })).toBeEnabled();
  for (const sentence of list) await page.locator('.word-chip', { hasText: answerFor(sentence) }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.locator('p.gs-text[role=status]')).toHaveText('3 von 3 richtig');
  await page.getByRole('button', { name: 'Nächste Seite' }).click();

  // Page 2: the first two words swapped – both are corrected.
  list = await sentences();
  const words = list.map(answerFor);
  for (const word of [words[1]!, words[0]!, ...words.slice(2)]) await page.locator('.word-chip', { hasText: word }).click();
  await page.getByRole('button', { name: 'Prüfen' }).click();
  await expect(page.locator('.cloze-gap.is-wrong')).toHaveCount(2);
  await expect(page.locator('.cloze-fix')).toHaveText([words[0]!, words[1]!]);
  await page.getByRole('button', { name: 'Zum Ergebnis' }).click();
  await expect(page.locator('.result-banner__title')).toHaveText('4 von 6 Lücken');
  await page.getByRole('button', { name: 'Beenden', exact: true }).click();
  await expect(page).toHaveURL(/\/lernen\/[^/]+$/);

  // Typing: lower case is right, a swapped letter almost right, a wrong word wrong.
  await page.locator('summary', { hasText: 'Weitere Einstellungen' }).click();
  await page.getByRole('radio', { name: 'Eintippen' }).click();
  await openMode(page, /Lückentext/);
  list = await sentences();
  const plan = [answerFor(list[0]!).toLowerCase(), 'Zürich', answerFor(list[2]!).replace('ei', 'ie')];
  for (const [i, text] of plan.entries()) {
    await page.getByLabel(`Lücke ${i + 1}`).fill(text);
    await page.getByLabel(`Lücke ${i + 1}`).press('Enter');
  }
  await expect(page.locator('.cloze-input').nth(0)).toHaveClass(/is-right/);
  await expect(page.locator('.cloze-input').nth(1)).toHaveClass(/is-wrong/);
  await expect(page.locator('.cloze-input').nth(2)).toHaveClass(/is-almost/);
  await expect(page.locator('p.gs-text[role=status]')).toContainText('2 von 3 richtig');
});
