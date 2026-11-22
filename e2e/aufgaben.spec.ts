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

test('Aufgaben: Wissenstest erstellen, mit Lösungen ansehen, als PDF speichern', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/aufgaben/neu');
  await page.getByRole('button', { name: 'Lernziele selbst schreiben' }).click();
  await page.getByLabel('Titel').fill('Die Römer');
  await page.getByLabel('Lernziel 1', { exact: true }).fill('Du kannst die Gründungssage Roms erzählen.');
  await page.getByRole('button', { name: 'Lernziel hinzufügen' }).click();
  await page.getByLabel('Lernziel 2', { exact: true }).fill('Du kannst erklären, wie die Republik regiert wurde.');
  await page.getByRole('button', { name: 'Thema speichern' }).click();
  await expect(page.getByText('Noch keine. Erstelle einen Wissenstest')).toBeVisible();

  // What to make: kind, time, difficulty, which goals.
  await page.getByRole('link', { name: 'Unterlage erstellen' }).click();
  await expect(page).toHaveURL(/\/unterlage$/);
  await expect(page.getByRole('radio', { name: /Wissenstest/ })).toHaveAttribute('aria-checked', 'true');
  await expect(page.getByText('Noch 20 von 20 Unterlagen diesen Monat')).toBeVisible();
  await page.getByRole('radiogroup', { name: 'Schwierigkeit' }).getByRole('radio', { name: 'Grundlagen' }).click();
  await expect(page.getByRole('checkbox')).toHaveCount(2);
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Wissenstest erstellen' }).click();

  // Phoni writes in the background; the page shows the document once it is ready.
  await expect(page.locator('h1')).toHaveText('Wissenstest: Die Römer', { timeout: 15_000 });
  await expect(page.locator('.doc-task')).toHaveCount(4);
  await expect(page.getByText('Du hast 15 Minuten Zeit.')).toBeVisible();
  await expect(page.getByText('Lösung:')).toHaveCount(0);
  await expectAccessible(page);

  await page.getByRole('radiogroup', { name: 'Ansicht' }).getByRole('radio', { name: 'Mit Lösungen' }).click();
  await expect(page.getByText('Lösung:')).toHaveCount(4);
  await expect(page.locator('.doc-task__options .is-right')).toHaveText('Romulus');
  await expect(page.getByText('(auch: Augusta Rauracorum)')).toBeVisible();
  await expect(page.getByText('Bitte prüfen: Schreibweise prüfen.')).toBeVisible();
  await expectAccessible(page);

  // The PDF is made in the browser – under the app's content security policy.
  await page.getByRole('button', { name: 'Als PDF' }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /Aufgaben und Lösungen/ }).click()]);
  expect(download.suggestedFilename()).toMatch(/^Wissenstest.*\.pdf$/);
  const file = await download.path();
  const { readFile } = await import('node:fs/promises');
  const bytes = await readFile(file);
  expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
  expect(bytes.length).toBeGreaterThan(5_000);

  // Listed with the topic; deleting asks first.
  await page.getByRole('button', { name: 'Zurück' }).first().click();
  const row = page.locator('.doc-card', { hasText: 'Wissenstest: Die Römer' });
  await expect(row).toContainText('Wissenstest · 15 Min. · 5 Punkte');
  await row.click();
  await page.getByRole('button', { name: 'Unterlage löschen' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Löschen' }).click();
  await expect(page.getByText('Unterlage gelöscht.')).toBeVisible();
  await expect(page.locator('.doc-card')).toHaveCount(0);
});
