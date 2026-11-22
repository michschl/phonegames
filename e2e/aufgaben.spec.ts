import { expect, test } from '@playwright/test';
import { expectAccessible, register, undo } from './helpers.ts';

test('Aufgaben: Thema aus Stichworten, Lernziele prüfen, speichern und bearbeiten', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/lernen');
  // «Karten | Aufgaben» at the top of «Lernen».
  await page.getByRole('radiogroup', { name: 'Bereich' }).getByRole('radio', { name: 'Aufgaben' }).click();
  await expect(page).toHaveURL('/lernen/aufgaben');
  await expect(page.getByRole('heading', { name: 'Prüfungen vorbereiten' })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('link', { name: 'Stichworte schreiben' }).click();
  await expect(page).toHaveURL(/\/aufgaben\/neu/);

  await page.getByLabel('Stichworte zum Thema').fill('Römer: Gründung Roms, Republik, Römer in der Schweiz');
  await page.getByLabel('Stufe').selectOption('5. Klasse');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Lernziele erstellen' }).click();

  await expect(page.getByRole('heading', { name: 'Lernziele prüfen' })).toBeVisible();
  await expect(page.getByLabel('Titel')).toHaveValue('Die Römer');
  await expect(page.getByLabel(/^Lernziel \d$/)).toHaveCount(3);
  await expect(page.locator('.card-row.is-uncertain')).toHaveCount(1);
  await page.getByLabel('Lernziel 3: Kernstoff').fill('Augusta Raurica bei Augst, Aventicum (Avenches).');
  await page.getByRole('button', { name: 'Lernziel hinzufügen' }).click();
  await page.getByLabel('Lernziel 4', { exact: true }).fill('Du kannst den Alltag in einer römischen Stadt beschreiben.');
  await page.getByLabel('Prüfung am (freiwillig)').fill('2099-12-03');
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Thema speichern' }).click();

  // The topic page: goals with their content, the day of the test.
  await expect(page).toHaveURL(/\/aufgaben\/[^/]+$/);
  await expect(page.locator('h1')).toHaveText('Die Römer');
  await expect(page.getByText('Prüfung am 3. Dezember 2099')).toBeVisible();
  await expect(page.locator('.goal-view li')).toHaveCount(4);
  await page.locator('.goal-view summary', { hasText: 'Spuren der Römer' }).click();
  await expect(page.getByText('Augusta Raurica bei Augst')).toBeVisible();
  await expectAccessible(page);

  // Edit: one goal less.
  await page.getByRole('link', { name: 'Thema bearbeiten' }).click();
  await page.getByRole('button', { name: 'Lernziel 4 löschen' }).click();
  await page.getByRole('button', { name: 'Speichern' }).click();
  await expect(page.locator('.goal-view li')).toHaveCount(3);

  // The tab opens «Aufgaben» again; the list shows the topic with its test.
  await page.goto('/');
  await page.locator('.tabbar a', { hasText: 'Lernen' }).click();
  await expect(page).toHaveURL('/lernen/aufgaben');
  const row = page.locator('.group-card', { hasText: 'Die Römer' });
  await expect(row).toContainText('3 Lernziele · Geschichte · 5. Klasse');
  await expect(row.locator('.exam-pill')).toContainText('Prüfung in');

  // Delete with «Rückgängig».
  await page.getByRole('button', { name: 'Aktionen für «Die Römer»' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Thema löschen' }).click();
  await expect(page.locator('.group-card', { hasText: 'Die Römer' })).toHaveCount(0);
  await undo(page);
  await expect(page.locator('.group-card', { hasText: 'Die Römer' })).toBeVisible();
});

test('Aufgaben: Lernziele selbst schreiben, ohne KI', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/aufgaben/neu');
  await page.getByRole('button', { name: 'Lernziele selbst schreiben' }).click();
  await page.getByLabel('Titel').fill('Bruchrechnen');
  await page.getByRole('button', { name: 'Thema speichern' }).click();
  await expect(page.getByText('Das Thema braucht mindestens ein Lernziel.')).toBeVisible();
  await page.getByLabel('Lernziel 1', { exact: true }).fill('Du kannst Brüche mit gleichem Nenner addieren.');
  await page.getByRole('button', { name: 'Thema speichern' }).click();
  await expect(page.locator('h1')).toHaveText('Bruchrechnen');
});
