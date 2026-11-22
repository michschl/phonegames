import { expect, test } from '@playwright/test';
import { PNG, acceptTerms, createStack, expectAccessible, register, undo } from './helpers.ts';

const photo = { name: 'blatt.png', mimeType: 'image/png', buffer: PNG };

test('Fotos: Kamera und Galerie, genau übernehmen', async ({ page }) => {
  await register(page);
  await page.goto('/stapel/neu');
  // Android only offers the camera for an input with «capture»; the gallery takes several photos.
  await expect(page.locator('input[type=file][capture=environment]:not([multiple])')).toHaveCount(1);
  await expect(page.locator('input[type=file][multiple]:not([capture])')).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Foto aufnehmen' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Aus der Galerie' })).toBeVisible();

  await page.locator('input[type=file][multiple]').setInputFiles([photo, { ...photo, name: 'seite2.png' }]);
  await expect(page.locator('.photo-tile img')).toHaveCount(2);
  await expect(page.getByRole('radio', { name: /Genau übernehmen/ })).toHaveAttribute('aria-checked', 'true');
  await expectAccessible(page);
  await page.locator('.start-bar .btn', { hasText: '2 Fotos auswerten' }).click();

  await expect(page.getByRole('heading', { name: 'Karten prüfen' })).toBeVisible();
  await expect(page.locator('.stack-review-note')).toContainText('Phoni hat 4 Karten erkannt.');
  await expect(page.locator('.stack-review-note')).toContainText('Namen und Noten habe ich weggelassen.');
  await expect(page.getByLabel('Titel')).toHaveValue('Unité 5 – Vocabulaire');
  await expect(page.locator('.card-row.is-uncertain')).toHaveCount(1);
  await expect(page.locator('.card-row__warn')).toContainText('Schrift unklar');

  // The draft survives leaving the page.
  await page.goto('/');
  await page.goto('/stapel/neu');
  await expect(page.locator('.card-row')).toHaveCount(4);
  // Nobody has learned yet – the stack page asks «Wer lernt?» before the first round.
  await page.getByRole('button', { name: 'Speichern & lernen' }).click();
  await expect(page).toHaveURL(/\/lernen\/[^/]+$/);
  await expect(page.locator('h1')).toHaveText('Unité 5 – Vocabulaire');
  await expect(page.getByRole('radiogroup', { name: 'Wer lernt?' })).toBeVisible();

  // Vocabulary with known languages: which one is shown is chosen before the round.
  const direction = page.getByRole('radiogroup', { name: 'Abfragen' });
  await expect(direction.getByRole('radio', { name: 'FR → DE' })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Französisch zeigen, auf Deutsch antworten: «le chien» → «der Hund»')).toBeVisible();
  await direction.getByRole('radio', { name: 'DE → FR' }).click();
  await expect(page.getByText('Deutsch zeigen, auf Französisch antworten: «der Hund» → «le chien»')).toBeVisible();
  await page.locator('.start-bar a').click();
  await expect(page.locator('.learn-card__kind')).toHaveText('Übersetze auf Französisch');
  await expect(page.locator('.learn-card__prompt')).toHaveText(/^(der Hund|das Haus|die Schule|immer)$/);
});

test('Fotos: neue Aufgaben erfinden, auffällige Karten sind markiert', async ({ page }) => {
  await register(page);
  await page.goto('/stapel/neu');
  await page.locator('input[type=file][multiple]').setInputFiles(photo);
  await page.getByRole('radio', { name: /Neue Aufgaben erfinden/ }).click();
  await page.getByRole('radio', { name: '10 Karten' }).click();
  await page.locator('.start-bar .btn', { hasText: '10 neue Karten erfinden' }).click();

  await expect(page.locator('.stack-review-note')).toContainText('neu erfunden und nochmals kontrolliert');
  await expect(page.locator('.stack-review-note')).toContainText('Eine Karte ist bei der Kontrolle aufgefallen');
  await expect(page.getByLabel('Titel')).toHaveValue('Unité 5 – Übung');
  await expect(page.locator('.card-row').nth(1).locator('.card-row__warn')).toContainText(
    'Möglicherweise falsch – «le jardin» heisst «der Garten».',
  );
  await expectAccessible(page);

  // Discard from the header – and bring it back.
  await page.getByRole('button', { name: 'Entwurf verwerfen' }).first().click();
  await page.locator('.sheet').getByRole('button', { name: 'Verwerfen' }).click();
  await expect(page.getByRole('button', { name: 'Foto aufnehmen' })).toBeVisible();
  await undo(page);
  await expect(page.locator('.card-row')).toHaveCount(3);
});

test('Teilen per Link: Vorschau, Konto per Link, Übernahme', async ({ page, browser }) => {
  await register(page, 'Lea');
  await createStack(page, 'Unité 5', ['le chien = der Hund', 'la maison = das Haus', 'manger = essen', 'toujours = immer']);
  await page.goto('/stapel');
  await expect(page).toHaveURL(/\/lernen$/);
  await page.locator('.group-card', { hasText: 'Unité 5' }).click();
  await page.getByRole('link', { name: 'Karten bearbeiten' }).click();
  await page.getByRole('button', { name: 'Link teilen' }).click();
  const link = await page.locator('.share-card__link').inputValue();
  expect(link).toMatch(/\/s\/[A-Za-z0-9_-]{22}$/);

  // Somebody new opens the link: the link is no invitation – the account starts with the free trial.
  const guest = await (await browser.newContext({ serviceWorkers: 'block' })).newPage();
  await guest.goto(link);
  await expect(guest.getByRole('heading', { name: 'Unité 5' })).toBeVisible();
  await expect(guest.locator('.share-page__hint')).toContainText('7 Tage gratis, danach CHF 5 pro Jahr.');
  await expectAccessible(guest);
  await guest.getByRole('link', { name: 'Konto erstellen & übernehmen' }).click();
  await expect(guest.getByRole('button', { name: 'Ich habe einen Einladungscode' })).toBeVisible();
  await guest.getByLabel('Dein Name').fill('Tim');
  await guest.getByLabel('E-Mail').fill(`tim-${Date.now()}@example.ch`);
  await guest.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await acceptTerms(guest);
  await guest.getByRole('button', { name: 'Weiter zum Abo' }).click();
  await expect(guest).toHaveURL('/abo');
  await guest.getByRole('button', { name: '7 Tage gratis testen' }).click();
  await guest.getByRole('button', { name: 'Bezahlen' }).click();
  // Back from Stripe: on to the shared stack, taken over right away.
  await expect(guest).toHaveURL(/\/lernen\/[^/]+$/);
  await expect(guest.locator('h1')).toHaveText('Unité 5');

  // Lea sees who took it over.
  await page.reload();
  await expect(page.locator('.share-card')).toContainText('1');
  await guest.context().close();
});

test('Löschen ist überall erreichbar und lässt sich rückgängig machen', async ({ page }) => {
  await register(page);
  await createStack(page, 'Einmaleins', ['7 × 8 = 56', '6 × 7 = 42', '9 × 9 = 81']);
  await createStack(page, 'Unité 5', Array.from({ length: 25 }, (_, i) => `mot ${i + 1} = Wort ${i + 1}`));

  // Stack list in «Lernen»: «⋯» → delete → undo.
  await page.goto('/lernen');
  await page.getByRole('button', { name: 'Aktionen für «Einmaleins»' }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Stapel löschen' }).click();
  await expect(page.locator('.list-row', { hasText: 'Einmaleins' })).toHaveCount(0);
  await undo(page);
  await expect(page.locator('.list-row', { hasText: 'Einmaleins' })).toHaveCount(1);

  // A long stack: the delete button is at the top, no scrolling needed.
  await page.locator('.list-row', { hasText: 'Unité 5' }).locator('.group-card').click();
  await page.getByRole('link', { name: 'Karten bearbeiten' }).click();
  const trash = page.getByRole('button', { name: 'Stapel löschen' }).first();
  expect((await trash.boundingBox())!.y).toBeLessThan(120);
  await trash.click();
  await page.locator('.sheet').getByRole('button', { name: 'Löschen' }).click();
  await expect(page).toHaveURL(/\/lernen$/);
  await undo(page);
  await expect(page.locator('.list-row', { hasText: 'Unité 5' })).toHaveCount(1);

  // A card while editing comes back at the same place.
  await page.locator('.list-row', { hasText: 'Einmaleins' }).locator('.group-card').click();
  await page.getByRole('link', { name: 'Karten bearbeiten' }).click();
  const prompts = () => page.locator('.card-row__prompt').evaluateAll((els) => els.map((e) => (e as HTMLTextAreaElement).value));
  await page.getByRole('button', { name: 'Karte 2 löschen' }).click();
  expect(await prompts()).toEqual(['7 × 8', '9 × 9']);
  await undo(page);
  expect(await prompts()).toEqual(['7 × 8', '6 × 7', '9 × 9']);

  // Groups and people.
  await page.goto('/gruppen');
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
  for (const name of ['Lea', 'Ben', 'Mia']) {
    await page.getByLabel('Name des Spielers').fill(name);
    await page.getByLabel('Name des Spielers').press('Enter');
    await expect(page.locator('.player-chip', { hasText: name })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Ben entfernen' }).click();
  await expect(page.locator('.player-chip', { hasText: 'Ben' })).toHaveCount(0);
  await undo(page);
  await expect(page.locator('.player-chip__name')).toHaveText(['Lea', 'Ben', 'Mia']);
  await page.goto('/gruppen');
  await page.locator('.list-row').first().getByRole('button', { name: /Aktionen für/ }).click();
  await page.getByRole('button', { name: 'Gruppe löschen' }).click();
  await expect(page.getByText('Noch keine Gruppe')).toBeVisible();
  await undo(page);
  await expect(page.locator('.list-row')).toHaveCount(1);

  // Restored data reaches the server (sync), not only this phone.
  await expect
    .poll(
      async () => {
        const data = await (await page.request.get('/api/account/export')).json();
        return {
          stacks: data.learnStacks.map((stack: { title: string }) => stack.title).sort(),
          players: data.groups.filter((g: { deleted: boolean }) => !g.deleted).flatMap((g: { players: { name: string }[] }) => g.players.map((p) => p.name)),
        };
      },
      { timeout: 15_000 },
    )
    .toEqual({ stacks: ['Einmaleins', 'Unité 5'], players: ['Lea', 'Ben', 'Mia'] });
});
