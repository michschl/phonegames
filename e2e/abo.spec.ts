import { expect, test, type Page } from '@playwright/test';
import { expectAccessible, register } from './helpers.ts';

/** Fills the registration form without an invitation code – the account needs the subscription. */
async function registerPaid(page: Page, name: string): Promise<string> {
  const email = `abo-${Date.now()}-${Math.round(Math.random() * 1e6)}@example.ch`;
  await page.goto('/registrieren');
  await expect(page.getByText('7 Tage gratis, danach CHF 5 pro Jahr.')).toBeVisible();
  await page.getByLabel('Dein Name').fill(name);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('checkbox', { name: /Ich akzeptiere die Nutzungsbedingungen/ }).check();
  await page.getByRole('button', { name: 'Weiter zum Abo' }).click();
  await expect(page).toHaveURL('/abo');
  return email;
}

test('Abo: ohne Einladungscode 7 Tage gratis testen, im Konto verwalten und kündigen', async ({ page }) => {
  await page.goto('/willkommen');
  await expect(page.locator('.welcome__price')).toContainText('7 Tage gratis, danach CHF 5 pro Jahr.');

  await registerPaid(page, 'Nina');
  await expect(page.getByRole('heading', { name: 'Hallo Nina!' })).toBeVisible();
  await expect(page.getByText('Teste phonegames 7 Tage gratis.')).toBeVisible();
  await expect(page.getByText('Bezahlen mit TWINT, Apple Pay, Google Pay oder Karte')).toBeVisible();
  await expectAccessible(page);
  // Without a subscription the app stays closed.
  await page.goto('/lernen');
  await expect(page).toHaveURL('/abo');

  // Stripe's payment page (a stand-in here) and back.
  await page.getByRole('button', { name: '7 Tage gratis testen' }).click();
  await expect(page.getByRole('heading', { name: 'Fake Stripe Checkout' })).toBeVisible();
  await expect(page.getByText('CHF 5 pro Jahr · 7 Tage gratis')).toBeVisible();
  await page.getByRole('button', { name: 'Bezahlen' }).click();
  await expect(page).toHaveURL('/');
  await expect(page.locator('.toast', { hasText: 'Deine Gratis-Tage laufen' })).toBeVisible();

  // «Konto»: how it runs, and Stripe's customer portal – no second subscription to take out.
  await page.goto('/konto');
  await expect(page.locator('.subscription-row')).toContainText(/Gratis bis .+, danach CHF 5 pro Jahr\./);
  await expectAccessible(page);
  await page.getByRole('button', { name: /Abo verwalten/ }).click();
  await expect(page.getByRole('heading', { name: 'Fake Stripe Kundenportal' })).toBeVisible();
  await page.getByRole('button', { name: 'Abo kündigen' }).click();
  await expect(page).toHaveURL('/konto');
  await expect(page.locator('.subscription-row')).toContainText(/Gekündigt – läuft bis /);
});

test('Abo: Zahlung abgebrochen – nach dem Anmelden wieder auf «Abo», Abmelden geht', async ({ page }) => {
  const email = await registerPaid(page, 'Tom');
  await page.getByRole('button', { name: '7 Tage gratis testen' }).click();
  await page.getByRole('link', { name: 'Zurück' }).click();
  await expect(page).toHaveURL('/abo');
  await page.getByRole('button', { name: 'Abmelden' }).click();
  await expect(page).toHaveURL('/willkommen');

  await page.goto('/anmelden');
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Anmelden', exact: true }).click();
  await expect(page).toHaveURL('/abo');
  await expect(page.getByRole('button', { name: '7 Tage gratis testen' })).toBeVisible();
});

test('Abo: mit Einladungscode kostenlos – kein Abo nötig, keins im Konto', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/konto');
  await expect(page.getByRole('heading', { name: 'Profil' })).toBeVisible();
  await expect(page.locator('.subscription-row')).toHaveCount(0);
  await page.goto('/abo');
  await expect(page).toHaveURL('/');
});
