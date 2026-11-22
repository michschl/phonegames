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
  await page.getByRole('button', { name: 'PDF', exact: true }).click();
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

test('Aufgaben: in der App lösen, Papier-Ergebnis, gezielt üben, Lernkarten und Prüfung in «Heute dran»', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/aufgaben/neu');
  await page.getByRole('button', { name: 'Lernziele selbst schreiben' }).click();
  await page.getByLabel('Titel').fill('Die Römer');
  await page.getByLabel('Lernziel 1', { exact: true }).fill('Du kannst die Gründungssage Roms erzählen.');
  await page.getByRole('button', { name: 'Lernziel hinzufügen' }).click();
  await page.getByLabel('Lernziel 2', { exact: true }).fill('Du kannst erklären, wie die Republik regiert wurde.');
  const inTwoDays = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  const iso = `${inTwoDays.getFullYear()}-${String(inTwoDays.getMonth() + 1).padStart(2, '0')}-${String(inTwoDays.getDate()).padStart(2, '0')}`;
  await page.getByLabel('Prüfung am (freiwillig)').fill(iso);
  await page.getByRole('button', { name: 'Thema speichern' }).click();
  const topicUrl = page.url();

  await page.getByRole('link', { name: 'Unterlage erstellen' }).click();
  await page.getByRole('button', { name: 'Wissenstest erstellen' }).click();
  await expect(page.locator('h1')).toHaveText('Wissenstest: Die Römer', { timeout: 15_000 });

  // Solve in the app: one task after the other.
  await page.getByRole('link', { name: 'In der App lösen' }).click();
  await expect(page.getByText('4 Aufgaben · 5 Punkte · etwa 15 Minuten')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Los geht’s' }).click();
  await expect(page.locator('h1')).toHaveText('Aufgabe 1 von 4');
  await page.getByRole('radio', { name: /Romulus/ }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByRole('radio', { name: 'richtig' }).click();
  await page.getByRole('button', { name: 'Weiter' }).click();
  await page.getByLabel('Deine Antwort').fill('augusta rauraca');
  await page.getByRole('button', { name: 'Weiter' }).click();
  await expect(page.locator('h1')).toHaveText('Aufgabe 4 von 4');
  await expectAccessible(page);
  // Leaving keeps the answers.
  await page.reload();
  await expect(page.locator('h1')).toHaveText('Aufgabe 4 von 4');
  await page.getByRole('button', { name: 'Aufgabe 3, beantwortet' }).click();
  await expect(page.getByLabel('Deine Antwort')).toHaveValue('augusta rauraca');
  await page.getByRole('button', { name: 'Aufgabe 4' }).click();
  await page.getByLabel('Deine Antwort').fill('Die Volksversammlung');
  // The notepad: write with the finger (or a pen).
  await page.getByRole('button', { name: 'Notizblatt' }).click();
  const sheet = page.getByRole('img', { name: /Notizblatt/ });
  const box = (await sheet.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 90, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole('button', { name: 'Leeren' })).toBeEnabled();
  await page.getByRole('button', { name: 'Abgeben' }).click();

  // The solutions; open tasks are judged by oneself.
  await expect(page.locator('h1')).toHaveText('Lösungen');
  await expect(page.locator('.solve-check.is-right')).toHaveCount(3);
  await expect(page.getByRole('button', { name: 'Ergebnis speichern' })).toBeDisabled();
  await page.getByRole('radiogroup', { name: 'Punkte für Aufgabe 4' }).getByRole('radio', { name: '2' }).click();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Ergebnis speichern' }).click();
  await expect(page.getByText('5 von 5 Punkten')).toBeVisible();
  await expect(page.getByText('Stark – das sitzt!')).toBeVisible();
  await page.getByRole('link', { name: 'Zum Thema' }).click();
  await expect(page.locator('.goal-view .goal-status__badge.is-sicher')).toHaveCount(2);
  await expect(page.getByText('sitzen alle geprüften Lernziele')).toBeVisible();

  // Solved on paper: points per task.
  await page.locator('.doc-card').click();
  await expect(page.locator('.attempt-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'Ergebnis vom Papier eintragen' }).click();
  for (let i = 1; i <= 4; i++) await page.getByRole('radiogroup', { name: `Punkte für Aufgabe ${i}` }).getByRole('radio', { name: '0' }).click();
  await expect(page.getByText('0 von 5 Punkten')).toBeVisible();
  await expectAccessible(page);
  await page.getByRole('button', { name: 'Ergebnis speichern' }).click();
  await expect(page).toHaveURL(topicUrl);
  await expect(page.locator('.goal-view .goal-status__badge.is-ueben')).toHaveCount(2);

  // «Gezielt üben» picks the goals that need practice.
  await page.getByRole('link', { name: 'Gezielt üben' }).click();
  await expect(page).toHaveURL(/unterlage\?ziele=/);
  await expect(page.getByRole('checkbox', { checked: true })).toHaveCount(2);
  await page.goBack();

  // Lernkarten from the goals: checked like a photo analysis, then a stack.
  await page.getByRole('button', { name: 'Lernkarten daraus machen' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Karten erstellen' }).click();
  await expect(page.getByRole('heading', { name: 'Karten prüfen' })).toBeVisible();
  await expect(page.getByText('zum Thema neu erfunden')).toBeVisible();
  await page.getByRole('button', { name: 'Speichern & lernen' }).click();

  // The test is in «Heute dran».
  await page.goto('/lernen');
  const exam = page.locator('.learn-due__row--exam');
  await expect(exam).toContainText('Prüfung in 2 Tagen');
  await expect(exam).toContainText('«Die Römer»');
  await exam.click();
  await expect(page).toHaveURL(topicUrl);
});
