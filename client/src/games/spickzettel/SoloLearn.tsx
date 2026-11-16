import type { LearnStack, Player } from '../../../../shared/types.ts';
import { normalize } from '../../lib/util.ts';
import { useGameSettings, useSettings } from '../../store/settings.ts';
import { spickzettel, type SpickzettelSettings } from './index.tsx';
import { Kartenkasten } from './Kartenkasten.tsx';
import { Lueckentext } from './Lueckentext.tsx';
import type { SoloMode } from './modes.ts';
import './spickzettel.css';

/** One person learns a stack – no group, no setup screen. Loaded lazily like the games. */
export default function SoloLearn({
  stack,
  mode,
  learner,
  onExit,
}: {
  stack: LearnStack;
  mode: SoloMode;
  learner: Player;
  onExit: () => void;
}) {
  const [stored] = useGameSettings<SpickzettelSettings>(spickzettel.id, spickzettel.defaultSettings!);
  // Everyone answers their own way: revealing, choosing or typing (chosen on the stack page).
  const check = useSettings((s) => s.learnCheck[normalize(learner.name)]) ?? stored.check;
  const settings = { ...stored, check };
  const players = [learner];
  if (mode === 'luecke') return <Lueckentext stack={stack} players={players} settings={settings} onExit={onExit} />;
  return <Kartenkasten stack={stack} players={players} settings={settings} onExit={onExit} autoStart />;
}
