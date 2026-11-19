import { expect, test } from '@playwright/test';
import { expectAccessible, expectNoSidewaysScroll, register } from './helpers.ts';

test('Registrierung braucht den Einladungscode, Anmelden und Abmelden', async ({ page }) => {
  await page.goto('/registrieren');
  await page.getByLabel('Einladungscode').fill('FALSCH');
  await page.getByLabel('Dein Name').fill('Mia');
  await page.getByLabel('E-Mail').fill(`falsch-${Date.now()}@example.ch`);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
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

test('Jedes Spiel hat eine Startseite mit Weg zurück', async ({ page }) => {
  await register(page);
  await page.goto('/entdecken');
  const links = await page.locator('a[href^="/spiel/"]').evaluateAll((els) => [...new Set(els.map((e) => e.getAttribute('href')!))]);
  expect(links.length).toBeGreaterThanOrEqual(17);
  // Lernen is a section of its own (tab), not a game of the catalogue.
  expect(links).not.toContain('/spiel/spickzettel');
  await expect(page.getByText('Schulstoff spielend repetieren')).toHaveCount(0);
  await expect(page.locator('.page__subtitle')).toHaveText('17 Spiele für jede Runde');
  await page.setViewportSize({ width: 320, height: 720 });
  for (const href of links) {
    await page.goto(href);
    await expect(page.locator('h1').first(), href).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zurück' }).first(), href).toBeVisible();
    await expect(page.locator('.start-bar .btn'), href).toBeVisible();
    await expectNoSidewaysScroll(page);
  }
});
