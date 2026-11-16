import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

let counter = 0;

/** Creates a new account (each test its own) and lands on the home page. */
export async function register(page: Page, name = 'Lea'): Promise<string> {
  const email = `e2e-${Date.now()}-${process.pid}-${counter++}@example.ch`;
  await page.goto('/registrieren');
  await page.getByLabel('Einladungscode').fill('PARTY-2026');
  await page.getByLabel('Dein Name').fill(name);
  await page.getByLabel('E-Mail').fill(email);
  await page.getByLabel('Passwort', { exact: true }).fill('passwort123');
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(page).toHaveURL('/');
  return email;
}

/** Types cards into «Karten abtippen», saves the stack and lands on the Spickzettel setup screen. */
export async function createStack(page: Page, title: string, lines: string[]): Promise<void> {
  await page.goto('/stapel/neu?text=1');
  await page.getByLabel('Karten, eine pro Zeile').fill(lines.join('\n'));
  await page.getByRole('button', { name: 'Karten erstellen' }).click();
  await page.getByLabel('Titel').fill(title);
  await page.getByRole('button', { name: 'Speichern & lernen' }).click();
  await expect(page).toHaveURL(/\/spiel\/spickzettel/);
}

/** On a game setup screen: creates the first group with these people. */
export async function createGroup(page: Page, names: string[]): Promise<void> {
  await page.getByRole('button', { name: 'Gruppe erstellen' }).click();
  for (const name of names) {
    await page.getByLabel('Name des Spielers').fill(name);
    await page.getByLabel('Name des Spielers').press('Enter');
    await expect(page.locator('.player-chip', { hasText: name })).toBeVisible();
  }
}

/** Opens the collapsed settings on a setup screen. */
export async function openSettings(page: Page): Promise<void> {
  await page.locator('.fold--settings summary').click();
}

export async function startGame(page: Page): Promise<void> {
  await page.locator('.start-bar .btn').click();
  await expect(page).toHaveURL(/\/los$/);
}

/** Spickzettel alone (Kartenkasten, Lückentext): the start button goes straight to /lernen/<stack>/<mode>. */
export async function startLearning(page: Page): Promise<void> {
  await page.locator('.start-bar .btn').click();
  await expect(page).toHaveURL(/\/lernen\/[^/]+\/(kasten|luecke)\?person=/);
}

/** «Wer lernt?» on the setup screen: adds a person who is in no group and chooses them. */
export async function addLearner(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: 'Person hinzufügen' }).click();
  await page.getByLabel('Wer lernt? Name').fill(name);
  await page.getByLabel('Wer lernt? Name').press('Enter');
  await expect(page.getByRole('radio', { name: new RegExp(`^${name}`) })).toHaveAttribute('aria-checked', 'true');
}

/** Ends a running game via «Spiel beenden» (with the confirmation if it asks). */
export async function endGame(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Spiel beenden' }).click();
  const confirm = page.locator('.sheet').getByRole('button', { name: 'Beenden' });
  // Most games ask first; a game that has not really started leaves right away.
  await confirm.click({ timeout: 2000 }).catch(() => undefined);
  await expect(page).not.toHaveURL(/\/los$|\/lernen\//);
}

/** WCAG 2.2 AA via axe-core – no findings allowed. */
export async function expectAccessible(page: Page): Promise<void> {
  // Entrance animations fade in – measured halfway, colours look paler than they are.
  await page.evaluate(() =>
    Promise.race([
      Promise.all(
        document
          .getAnimations()
          .filter((a) => a.effect?.getTiming().iterations !== Infinity)
          .map((a) => a.finished.catch(() => undefined)),
      ),
      new Promise((resolve) => setTimeout(resolve, 3000)),
    ]),
  );
  const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze();
  const findings = result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
  expect(findings).toEqual([]);
}

/** The page never scrolls sideways (small phones, large text). */
export async function expectNoSidewaysScroll(page: Page): Promise<void> {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Taps «Rückgängig» in the newest notice. */
export async function undo(page: Page): Promise<void> {
  await page.locator('.toast__action', { hasText: 'Rückgängig' }).last().click();
}

/** A tiny valid PNG – the fake AI does not look at it, the app only needs a real image. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAbUlEQVR42u3WsQ2AIBRFUTDOQxzEcRnEOImlsbI0gY5G0PNKKk7yixuv8wgjbwqDDwAAAODdzfVTWtaef7xv2QkBADyLYg4AAADgCy1UFI4TAgDQQgAAAAC/aqHmRnJCAFpICwEAAAAAAAA07wb9wRTrTrr5lAAAAABJRU5ErkJggg==',
  'base64',
);
