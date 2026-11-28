import { expect, test, type Page } from '@playwright/test';
import { createGroup, expectAccessible, openSettings, register } from './helpers.ts';

/**
 * The next rolls show these faces. The dice take their numbers from Math.random – for a moment it hands
 * out what the test wants (the number die first, then the colour die), afterwards it is itself again.
 */
async function nextRolls(page: Page, ...faces: number[]): Promise<void> {
  await page.evaluate((list) => {
    const holder = window as unknown as { realRandom?: () => number };
    const real = (holder.realRandom ??= Math.random);
    const queue = [...list];
    Math.random = () => (queue.length > 0 ? (queue.shift()! - 0.5) / 6 : real());
  }, faces);
}

async function roll(page: Page, ...faces: number[]): Promise<void> {
  // The dice can be rolled: the stick of the move before has come to rest.
  await expect(page.locator('.plumps-dice')).toBeEnabled({ timeout: 15_000 });
  await nextRolls(page, ...faces);
  await page.locator('.plumps-dice').click();
}

/** From the setup screen into the game, past «Wer beginnt?». */
async function begin(page: Page): Promise<void> {
  await page.locator('.start-bar .btn').click();
  await expect(page).toHaveURL(/\/spiel\/plumps\/los$/);
  await expect(page.getByText('Wer beginnt?')).toBeVisible();
  await page.locator('.gs-stage').click();
  await expect(page.locator('.plumps-dice')).toBeVisible({ timeout: 15_000 });
}

const whoIsOn = (page: Page) => page.locator('.plumps-turn__who strong').innerText();
const hole = (page: Page, n: number) => page.locator(`[data-hole="${n}"]`);
const note = (page: Page) => page.locator('.plumps-note');
const sticksOf = (page: Page, name: string) => page.locator('.plumps-player', { hasText: `${name}:` }).locator('.plumps-player__count');

test('Plumps: stecken, nehmen, in die Kiste – eine ganze Partie mit dem Zahlenwürfel, mit Rangliste', async ({ page }) => {
  await register(page, 'Lea');
  // In the catalogue, with its own picture.
  await page.goto('/entdecken');
  await page.getByLabel('Spiele suchen').fill('Würfel');
  await page.locator('a[href="/spiel/plumps"]').click();
  await expect(page.locator('h1')).toHaveText('Plumps!');
  await createGroup(page, ['Lea', 'Tim']);
  await openSettings(page);
  await expect(page.getByRole('radiogroup', { name: 'Würfel' }).getByRole('radio', { name: 'Zahlen' })).toHaveAttribute('aria-checked', 'true');
  await page.getByRole('radiogroup', { name: 'Stäbchen pro Person' }).getByRole('radio', { name: '3' }).click();
  await expectAccessible(page);
  await begin(page);

  // Everybody has three sticks, one die on the table.
  await expect(page.locator('.die')).toHaveCount(1);
  await expect(sticksOf(page, 'Lea')).toHaveText('3');
  await expect(sticksOf(page, 'Tim')).toHaveText('3');
  const first = await whoIsOn(page);
  const second = first === 'Lea' ? 'Tim' : 'Lea';
  await expectAccessible(page);

  // A free hole takes a stick.
  await roll(page, 2);
  await expect(note(page)).toHaveText('Loch 2 ist frei – Stäbchen rein!');
  await expect(hole(page, 2)).toHaveAttribute('aria-label', `Loch 2, Grün: besetzt von ${first}`);
  await expect(sticksOf(page, first)).toHaveText('2');

  // The same hole again: the other one has to take the stick.
  await expect(page.locator('.plumps-turn__who')).toContainText(`${second} ist dran`);
  await roll(page, 2);
  await expect(note(page)).toHaveText(`Besetzt! ${second} muss das Stäbchen nehmen.`);
  await expect(hole(page, 2)).toHaveAttribute('aria-label', 'Loch 2, Grün: frei');
  await expect(sticksOf(page, second)).toHaveText('4');

  // A six: into the box, and the same one rolls again – down to the last stick.
  await expect(page.locator('.plumps-turn__who')).toContainText(`${first} ist dran`);
  await roll(page, 6);
  await expect(note(page)).toContainText(`Plumps – weg ist es! ${first} würfelt nochmals!`);
  await expect(page.locator('.plumps-front__plate')).toHaveText('1 in der Kiste');
  await expect(sticksOf(page, first)).toHaveText('1');
  await expect(page.getByText('Letztes Stäbchen!')).toBeVisible();
  await expect(page.locator('.plumps-turn__who')).toContainText(`${first} ist dran`);

  // The last stick falls: the game is won.
  await roll(page, 6);
  await expect(page.getByRole('heading', { name: `${first} gewinnt!` })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Alle Stäbchen sind weg – 2 liegen in der Kiste.')).toBeVisible();
  const rows = page.locator('.score-list__item');
  await expect(rows.first()).toContainText(first);
  await expect(rows.first()).toContainText('0 Stäbchen');
  await expect(rows.nth(1)).toContainText('4 Stäbchen');
  await expectAccessible(page);

  // Once more with the same people, then back: the win is in the leaderboard of the family.
  await page.getByRole('button', { name: 'Nochmal' }).click();
  await expect(sticksOf(page, 'Lea')).toHaveText('3');
  await expect(page.locator('.plumps-front__plate')).toHaveText('0 in der Kiste');
  await page.getByRole('button', { name: 'Spiel beenden' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();
  await expect(page).toHaveURL('/spiel/plumps');
  await page.getByText('Rangliste der Familie').click();
  const ranking = page.getByRole('list', { name: 'Rangliste der Familie' }).locator('.ranking__row');
  await expect(ranking).toHaveCount(2);
  await expect(ranking.first()).toContainText(first);
  await expect(ranking.first()).toContainText('1 Sieg');
});

test('Plumps mit Farbwürfel und mit beiden Würfeln: Wahl zwischen Zahl und Farbe, Doppeltreffer, Weiterwürfeln', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/spiel/plumps');
  await createGroup(page, ['Lea', 'Tim', 'Mia']);
  await openSettings(page);
  const dice = page.getByRole('radiogroup', { name: 'Würfel' });
  await dice.getByRole('radio', { name: 'Beide' }).click();
  await expect(page.getByText('Du wählst, ob die Zahl oder die Farbe gilt.', { exact: false })).toBeVisible();
  await begin(page);
  await expect(page.locator('.die')).toHaveCount(2);

  // Number 2 and orange: the player chooses – with the button …
  const first = await whoIsOn(page);
  await roll(page, 2, 4);
  const choice = page.getByRole('group', { name: 'Zahl oder Farbe' });
  await expect(choice.getByRole('button')).toHaveText(['Zahl 2frei', 'Orangefrei']);
  await expectAccessible(page);
  await choice.getByRole('button', { name: /Orange/ }).click();
  await expect(hole(page, 4)).toHaveAttribute('aria-label', `Loch 4, Orange: besetzt von ${first}`);

  // … or with a tap on the hole itself. What each one would do is said on the buttons.
  await expect(page.locator('.plumps-turn__who')).not.toContainText(first);
  const second = await whoIsOn(page);
  await roll(page, 4, 5);
  await expect(choice.getByRole('button')).toHaveText(['Zahl 4besetzt', 'Violettfrei']);
  await hole(page, 5).click();
  await expect(hole(page, 5)).toHaveAttribute('aria-label', `Loch 5, Violett: besetzt von ${second}`);
  await expect(sticksOf(page, second)).toHaveText('4');

  // Both dice name the same hole: a double hit – straight into the box, even over a free hole, and once more.
  await expect(page.locator('.plumps-turn__who')).not.toContainText(second);
  const third = await whoIsOn(page);
  await roll(page, 3, 3);
  await expect(page.locator('.plumps-flash')).toHaveText('Doppeltreffer!');
  await expect(note(page)).toContainText(`Doppeltreffer – plumps, weg ist es! ${third} würfelt nochmals!`);
  await expect(hole(page, 3)).toHaveAttribute('aria-label', 'Loch 3, Gelb: frei');
  await expect(page.locator('.plumps-front__plate')).toHaveText('1 in der Kiste');
  await expect(sticksOf(page, third)).toHaveText('4');

  // The colour die alone, and rolling on as long as one dares.
  await page.getByRole('button', { name: 'Spiel beenden' }).click();
  await page.locator('.sheet').getByRole('button', { name: 'Beenden' }).click();
  await openSettings(page);
  await dice.getByRole('radio', { name: 'Farben' }).click();
  await page.getByRole('radiogroup', { name: 'Nochmals würfeln' }).getByRole('radio', { name: 'Solange du willst' }).click();
  await begin(page);
  await expect(page.locator('.die--farbe')).toHaveCount(1);
  await expect(page.locator('.die--zahl')).toHaveCount(0);
  const brave = await whoIsOn(page);
  await roll(page, 1);
  await expect(note(page)).toHaveText('Blau ist frei – Stäbchen rein!');
  // Rolled on: red is the open hole.
  await page.getByRole('button', { name: 'Nochmals' }).click({ trial: true });
  await roll(page, 6);
  await expect(note(page)).toHaveText('Plumps – weg ist es!');
  await expect(sticksOf(page, brave)).toHaveText('3');
  // Enough: the next one is on.
  await page.getByRole('button', { name: 'Weitergeben' }).click();
  await expect(page.locator('.plumps-turn__who')).not.toContainText(brave);
});

test('Plumps passt auf kleine Handys und ins Querformat, auch mit acht Personen', async ({ page }) => {
  await register(page, 'Lea');
  await page.goto('/spiel/plumps');
  await createGroup(page, ['Lea', 'Tim', 'Mia', 'Noah', 'Emma', 'Ben', 'Lina', 'Paul']);
  await page.setViewportSize({ width: 320, height: 568 });
  await begin(page);
  const inside = async () => {
    const view = page.viewportSize()!;
    for (const part of ['.plumps-players', '.plumps-board', '.plumps-dice']) {
      const box = (await page.locator(part).boundingBox())!;
      expect(box.x, part).toBeGreaterThanOrEqual(-1);
      expect(box.y, part).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width, part).toBeLessThanOrEqual(view.width + 1);
      expect(box.y + box.height, part).toBeLessThanOrEqual(view.height + 1);
    }
  };
  await inside();
  await expect(page.locator('.plumps-player')).toHaveCount(8);
  await page.setViewportSize({ width: 740, height: 360 });
  await inside();
});
