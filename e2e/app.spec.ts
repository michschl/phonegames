import { expect, test } from '@playwright/test';
import { acceptTerms, expectAccessible, expectNoSidewaysScroll, register } from './helpers.ts';

test('Registrierung: ein falscher Einladungscode wird gemeldet, Anmelden und Abmelden', async ({ page }) => {
  await page.goto('/registrieren');
  await page.getByRole('button', { name: 'Ich habe einen Einladungscode' }).click();
  await page.getByLabel('Einladungscode').fill('FALSCH');
  await page.getByLabel('Dein Name').fill('Mia');
  await page.getByLabel('E-Mail').fill(`falsch-${Date.now()}@example.ch`);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await acceptTerms(page);
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(page.locator('.field__error')).toBeVisible();
  await expect(page).toHaveURL(/\/registrieren/);

  const email = await register(page, 'Mia');
  await page.goto('/konto');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL(/\/willkommen/);

  await page.goto('/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL('/');
});

test('Tabs und Seiten sind zugänglich und scrollen nie seitlich', async ({ page }) => {
  await register(page);
  for (const [path, heading] of [
    ['/', /Lea/],
    ['/lernen', 'Lernen'],
    ['/entdecken', 'Entdecken'],
    ['/gruppen', 'Spielgruppen'],
    ['/konto', 'Konto'],
  ] as const) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toHaveText(heading);
    await expectAccessible(page);
  }
  await page.setViewportSize({ width: 280, height: 700 });
  for (const path of ['/', '/lernen', '/entdecken', '/gruppen', '/konto']) {
    await page.goto(path);
    await expect(page.locator('h1').first()).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
});

test('Umschalter bleiben an ihrem Platz, der grosse Knopf führt zu den fehlenden Mitspielenden', async ({ page }) => {
  await register(page);
  // «Zusammen | Allein | Arena»: the same place in every area, so a second tap hits the switch again.
  const areas = page.getByRole('radiogroup', { name: 'Spielart' });
  const top = async () => Math.round((await areas.boundingBox())?.y ?? -1);
  await expect(areas).toBeVisible();
  const home = await top();
  expect(home).toBeGreaterThan(0);
  for (const [area, path] of [['Allein', '/allein'], ['Arena', '/arena'], ['Zusammen', '/']] as const) {
    await areas.getByRole('radio', { name: area }).click();
    await expect(page).toHaveURL(path);
    await expect(areas.getByRole('radio', { name: area })).toHaveAttribute('aria-checked', 'true');
    // Polled: the page is swapped with a short transition.
    await expect.poll(top, { message: area }).toBe(home);
  }
  // Every area carries the colour of its tab.
  await expect(page.locator('html')).toHaveAttribute('data-area', 'spiele');
  await page.goto('/lernen');
  await expect(page.locator('html')).toHaveAttribute('data-area', 'lernen');
  await page.goto('/konto');
  await expect(page.locator('html')).toHaveAttribute('data-area', 'konto');

  // Nobody to play with yet: the button at the bottom leads to the names instead of being greyed out.
  await page.goto('/spiel/bombe');
  await page.getByRole('button', { name: 'Mitspielende hinzufügen' }).click();
  const name = page.getByLabel('Name des Spielers');
  await expect(name).toBeFocused();
  await name.fill('Lea');
  await name.press('Enter');
  await page.getByRole('button', { name: 'Noch 1 Person hinzufügen' }).click();
  await expect(name).toBeFocused();
  await name.fill('Tim');
  await name.press('Enter');
  await expect(page.locator('.start-bar .btn')).toHaveText('Spiel starten · 2 Personen');
  await expectAccessible(page);
});

test('Eine neue Seite beginnt oben, «Zurück» führt an die Stelle in der Liste zurück', async ({ page }) => {
  await register(page);
  const scrollY = () => page.evaluate(() => Math.round(window.scrollY));
  await page.goto('/entdecken');
  // Far down in the list – then to another tab: it opens at its top, not somewhere in the middle.
  await page.locator('a[href="/arena/kette"]').scrollIntoViewIfNeeded();
  expect(await scrollY()).toBeGreaterThan(800);
  await page.locator('.tabbar a', { hasText: 'Konto' }).click();
  await expect(page).toHaveURL('/konto');
  await expect.poll(scrollY).toBe(0);
  await page.locator('.tabbar a', { hasText: 'Entdecken' }).click();
  await expect(page).toHaveURL('/entdecken');
  await expect.poll(scrollY).toBe(0);

  // Into a game from the middle of the list and back: the list is where it was left.
  const game = page.locator('a[href="/spiel/schaetzmeister"]');
  await game.scrollIntoViewIfNeeded();
  await page.mouse.wheel(0, 200);
  await expect.poll(scrollY).toBeGreaterThan(500);
  await game.click();
  await expect(page).toHaveURL('/spiel/schaetzmeister');
  await expect.poll(scrollY).toBe(0);
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  await expect(page).toHaveURL('/entdecken');
  await expect.poll(scrollY).toBeGreaterThan(500);
  await expect(game).toBeInViewport();
});

test('Entdecken zeigt auch die Spiele von «Allein» und der Arena', async ({ page }) => {
  await register(page);
  await page.goto('/entdecken');
  for (const title of ['Zusammen spielen', 'Allein spielen', 'Arena']) {
    await expect(page.getByRole('heading', { name: new RegExp(`^${title}`) })).toBeVisible();
  }
  await expect(page.locator('a[href^="/allein/"]')).toHaveCount(5);
  await expect(page.locator('a[href^="/arena/"]')).toHaveCount(8);
  await expectAccessible(page);

  // Alone: the games of «Allein» and the Arena, no game for a group.
  const alone = page.getByRole('radio', { name: '1', exact: true });
  await alone.click();
  await expect(page.getByRole('heading', { name: '14 Spiele gefunden' })).toBeVisible();
  await expect(page.locator('a[href="/allein/memo"]')).toBeVisible();
  await expect(page.locator('a[href="/arena/piste"]')).toBeVisible();
  await expect(page.locator('a[href="/spiel/bombe"]')).toHaveCount(0);
  await alone.click();

  // The search finds them too; «Zurück» leads back to «Entdecken».
  await page.getByLabel('Spiele suchen').fill('Paare');
  await expect(page.locator('.game-list a')).toHaveCount(1);
  await page.locator('a[href="/allein/memo"]').click();
  await expect(page).toHaveURL('/allein/memo');
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  await expect(page).toHaveURL('/entdecken');
  await page.goto('/entdecken');
  await page.locator('a[href="/arena/kette"]').click();
  await expect(page).toHaveURL('/arena/kette');
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  await expect(page).toHaveURL('/entdecken');
});

test('Jedes Spiel hat eine Startseite mit Weg zurück', async ({ page }) => {
  await register(page);
  await page.goto('/entdecken');
  const links = await page.locator('a[href^="/spiel/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')!))]);
  expect(links.length).toBeGreaterThanOrEqual(17);
  // Lernen is a section of its own (tab), not a game of the catalogue.
  expect(links).not.toContain('/spiel/spickzettel');
  await expect(page.getByText('Schulstoff spielend repetieren')).toHaveCount(0);
  await expect(page.locator('.page__subtitle')).toHaveText('30 Spiele – zusammen, allein und in 3D');
  await page.setViewportSize({ width: 320, height: 720 });
  for (const href of links) {
    await page.goto(href);
    await expect(page.locator('h1').first(), href).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zurück' }).first(), href).toBeVisible();
    await expect(page.locator('.start-bar .btn'), href).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
});
