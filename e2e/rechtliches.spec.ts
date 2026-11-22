import { expect, test } from '@playwright/test';
import { expectAccessible, LEGAL_READY } from './helpers.ts';

test('Rechtliches: Impressum, AGB und Datenschutz sind ohne Konto erreichbar und verlinkt', async ({ page }) => {
  await page.goto('/willkommen');
  const links = page.getByRole('navigation', { name: 'Rechtliches' });
  await expect(links.getByRole('link')).toHaveText(['Impressum', 'AGB', 'Datenschutz']);
  await links.getByRole('link', { name: 'AGB' }).click();
  await expect(page).toHaveURL('/agb');
  await expect(page.getByRole('heading', { name: 'Nutzungsbedingungen (AGB)' })).toBeVisible();
  await expect(page.getByText('Danach kostet das Abo CHF 5 pro Jahr.', { exact: false })).toBeVisible();
  await expectAccessible(page);
  await page.goto('/datenschutz');
  await expect(page.getByRole('heading', { name: 'Datenschutzerklärung' })).toBeVisible();
  await expect(page.getByText('Infomaniak Network AG, Genf (Schweiz):')).toBeVisible();
  await expectAccessible(page);
  await page.goto('/impressum');
  await expect(page.getByRole('heading', { name: 'Impressum' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Betreiber' })).toBeVisible();
});

test('Registrierung: ohne Zustimmung geht es nicht, die Texte öffnen sich über dem Formular', async ({ page }) => {
  test.skip(!LEGAL_READY, 'Betreiberangaben fehlen noch – bis dahin wird keine Zustimmung verlangt.');
  await page.goto('/registrieren');
  await page.getByLabel('Dein Name').fill('Nina');
  await page.getByLabel('E-Mail').fill(`nina-${Date.now()}@example.ch`);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Weiter zum Abo' }).click();
  await expect(page.getByText('Bitte stimme den Nutzungsbedingungen zu.')).toBeVisible();
  await expect(page).toHaveURL('/registrieren');

  // Reading the terms does not lose what was typed.
  await page.locator('.consent').getByRole('button', { name: 'Nutzungsbedingungen' }).click();
  await expect(page.getByRole('dialog', { name: 'Nutzungsbedingungen (AGB)' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByLabel('Dein Name')).toHaveValue('Nina');
  await page.getByRole('checkbox', { name: /Ich akzeptiere die Nutzungsbedingungen/ }).check();
  await page.getByRole('button', { name: 'Weiter zum Abo' }).click();
  await expect(page).toHaveURL('/abo');
});

test('Bestehende Konten stimmen einmal zu, bevor es weitergeht', async ({ page }) => {
  test.skip(!LEGAL_READY, 'Betreiberangaben fehlen noch – bis dahin wird keine Zustimmung verlangt.');
  // An account from before the terms (or of an older app): registered without consent.
  const email = `alt-${Date.now()}@example.ch`;
  const res = await page.request.post('/api/auth/register', {
    headers: { 'X-Requested-With': 'phonegames' },
    data: { name: 'Alt', email, password: 'passwort123', inviteCode: 'PARTY-2026' },
  });
  expect(res.status()).toBe(201);
  expect((await res.json()).user.termsAccepted).toBe(false);
  // Signing in: the app asks for consent before anything else.
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL('/bedingungen');
  await page.goto('/lernen');
  await expect(page).toHaveURL('/bedingungen');
  await expect(page.getByText('Dein Konto bleibt kostenlos.', { exact: false })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Zustimmen und weiter' }).click();
  await expect(page.getByText('Bitte stimme den Nutzungsbedingungen zu.')).toBeVisible();
  await page.getByRole('checkbox', { name: /Ich akzeptiere die Nutzungsbedingungen/ }).check();
  await page.getByRole('button', { name: 'Zustimmen und weiter' }).click();
  await expect(page).toHaveURL('/');
  await page.reload();
  await expect(page).toHaveURL('/');
});

test('Ohne Betreiberangaben: keine Zustimmung bei der Registrierung und für bestehende Konten', async ({ page }) => {
  test.skip(LEGAL_READY, 'Die Betreiberangaben sind eingetragen – die Zustimmung ist aktiv.');
  await page.goto('/registrieren');
  await expect(page.getByRole('checkbox', { name: /Ich akzeptiere die Nutzungsbedingungen/ })).toHaveCount(0);
  // The placeholders are highlighted on the imprint.
  await page.goto('/impressum');
  await expect(page.locator('.legal__todo').first()).toBeVisible();
  // An existing account goes straight into the app.
  const email = `alt-${Date.now()}@example.ch`;
  await page.request.post('/api/auth/register', {
    headers: { 'X-Requested-With': 'phonegames' },
    data: { name: 'Alt', email, password: 'passwort123', inviteCode: 'PARTY-2026' },
  });
  await page.goto('/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL('/');
  await page.goto('/lernen');
  await expect(page).toHaveURL('/lernen');
});
