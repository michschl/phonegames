import { lazy } from 'react';
import type { GameDefinition, GameSettingsProps } from '../types.ts';
import { OptionRow, SettingsPanel } from '../shared/settings.tsx';
import { DEFAULT_SETTINGS, type PlumpsSettings } from './logic.ts';
import { PlumpsArt } from './PlumpsArt.tsx';

const DICE_HINT: Record<PlumpsSettings['dice'], string> = {
  zahlen: 'Ein Würfel mit Augen: Die Zahl sagt, in welches Loch das Stäbchen kommt.',
  farben: 'Ein Würfel mit Farben – ideal für die Kleinsten: Die Farbe zeigt das Loch.',
  beide: 'Beide Würfel zusammen: Du wählst, ob die Zahl oder die Farbe gilt. Zeigen beide aufs gleiche Loch, fällt dein Stäbchen direkt in die Kiste.',
};

function Settings({ value, onChange }: GameSettingsProps<PlumpsSettings>) {
  return (
    <SettingsPanel>
      <OptionRow
        label="Würfel"
        value={value.dice}
        options={[
          { value: 'zahlen', label: 'Zahlen' },
          { value: 'farben', label: 'Farben' },
          { value: 'beide', label: 'Beide' },
        ]}
        onChange={(dice) => onChange({ ...value, dice })}
        hint={DICE_HINT[value.dice]}
      />
      <OptionRow
        label="Stäbchen pro Person"
        value={value.sticks}
        options={[3, 5, 8].map((n) => ({ value: n, label: `${n}` }))}
        onChange={(sticks) => onChange({ ...value, sticks })}
      />
      <OptionRow
        label="Nochmals würfeln"
        value={value.again}
        options={[
          { value: 'sechs', label: 'Nur bei 6' },
          { value: 'frei', label: 'Solange du willst' },
        ]}
        onChange={(again) => onChange({ ...value, again })}
        hint={
          value.again === 'frei'
            ? 'Für Mutige: Nach jedem Stäbchen, das du loswirst, darfst du weiterwürfeln – bis du eines nehmen musst oder aufhörst.'
            : 'Ein Wurf pro Zug. Nur wer ein Stäbchen in die Kiste wirft, würfelt nochmals.'
        }
      />
    </SettingsPanel>
  );
}

export const plumps: GameDefinition<PlumpsSettings> = {
  id: 'plumps',
  name: 'Plumps!',
  tagline: 'Würfeln, stecken – bei 6 macht es plumps',
  description:
    'Das Stäbchen-Würfelspiel mit der Kiste: Würfle und steck ein Stäbchen ins passende Loch. Ist es besetzt, musst du das Stäbchen nehmen. Bei einer 6 fällt deines in die Kiste – plumps! Wer zuerst keine Stäbchen mehr hat, gewinnt. Mit Zahlenwürfel, Farbwürfel oder beiden.',
  emoji: '🎲',
  colors: ['#ffb02e', '#ff5a5f'],
  minPlayers: 2,
  maxPlayers: 8,
  duration: '5–15 Min.',
  age: 'ab 4 J.',
  tags: ['Würfel', 'Schnell', 'Familie'],
  status: 'available',
  scored: 'wins',
  rules: [
    'Alle bekommen gleich viele Stäbchen. Wer zuerst keines mehr hat, gewinnt.',
    'Würfle: Ist das Loch mit deiner Zahl (oder Farbe) frei, kommt eines deiner Stäbchen hinein.',
    'Steckt dort schon ein Stäbchen, musst du es nehmen – Pech gehabt!',
    'Bei einer 6 (oder Rot) fällt dein Stäbchen in die Kiste – plumps! – und du würfelst nochmals.',
    'Mit beiden Würfeln wählst du, ob die Zahl oder die Farbe gilt. Zeigen beide aufs gleiche Loch: Doppeltreffer, ab in die Kiste!',
  ],
  defaultSettings: DEFAULT_SETTINGS,
  Settings,
  Play: lazy(() => import('./PlumpsGame.tsx')),
  Art: PlumpsArt,
};
