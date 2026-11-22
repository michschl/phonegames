import { useRef, useState } from 'react';
import { sound } from '../../lib/audio.ts';
import { haptic } from '../../lib/device.ts';
import { GameShell } from '../../games/shared/GameShell.tsx';
import { makePuzzle, puzzlePoints, starsFor, type Puzzle } from '../logic.ts';
import type { SoloPlayProps } from '../types.ts';
import '../solo.css';

const ROUNDS = 10;

/** Muster-Meister: what belongs where the question mark is? */
export default function MusterGame({ level, onFinish, onQuit }: SoloPlayProps) {
  const [index, setIndex] = useState(0);
  const [puzzle, setPuzzle] = useState<Puzzle>(() => makePuzzle(level, 0));
  const [chosen, setChosen] = useState<string | null>(null);
  const [score, setScore] = useState(0);
  const [right, setRight] = useState(0);
  const shownAt = useRef(Date.now());

  const choose = (option: string) => {
    if (chosen) return;
    sound.unlock();
    setChosen(option);
    const correct = option === puzzle.answer;
    const seconds = (Date.now() - shownAt.current) / 1000;
    const nextScore = correct ? score + puzzlePoints(seconds) : score;
    const nextRight = correct ? right + 1 : right;
    if (correct) {
      sound.correct();
      haptic(10);
    } else {
      sound.wrong();
      haptic([20, 40, 20]);
    }
    setScore(nextScore);
    setRight(nextRight);
    window.setTimeout(
      () => {
        if (index + 1 >= ROUNDS) {
          onFinish({ score: nextScore, stars: starsFor(nextRight / ROUNDS), summary: `${nextRight} von ${ROUNDS} Reihen richtig` });
          return;
        }
        setIndex(index + 1);
        setPuzzle(makePuzzle(level, index + 1));
        setChosen(null);
        shownAt.current = Date.now();
      },
      correct ? 800 : 1500,
    );
  };

  return (
    <GameShell label={`Reihe ${index + 1} von ${ROUNDS}`} onExit={onQuit} accent="#ffb13d">
      <div className="solo-hud">
        <span>
          Richtig <strong>{right}</strong>
        </span>
        <span>
          Punkte <strong>{score}</strong>
        </span>
      </div>
      <div className="muster">
        <p className="muster__ask">Was gehört an die Stelle von ❓</p>
        <ol className={`muster__row ${puzzle.numbers ? 'is-numbers' : ''}`} aria-label="Reihe">
          {puzzle.items.map((item, i) => (
            <li key={`${index}-${i}`} className={`muster__item ${item === null ? 'is-gap' : ''}`} style={{ animationDelay: `${i * 70}ms` }}>
              {item === null ? (chosen ? puzzle.answer : '❓') : item}
            </li>
          ))}
        </ol>
        <div className={`muster__options ${puzzle.numbers ? 'is-numbers' : ''}`} role="group" aria-label="Antworten">
          {puzzle.options.map((option) => (
            <button
              key={option}
              type="button"
              className={`muster__option ${chosen && option === puzzle.answer ? 'is-right' : ''} ${chosen === option && option !== puzzle.answer ? 'is-wrong' : ''}`}
              disabled={chosen !== null}
              onClick={() => choose(option)}
            >
              {option}
            </button>
          ))}
        </div>
      </div>
    </GameShell>
  );
}
