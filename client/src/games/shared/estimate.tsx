import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Button } from '../../components/ui.tsx';
import { sound } from '../../lib/audio.ts';
import { parseEstimate } from '../../lib/numbers.ts';
import { PromptCard, Stage } from './GameShell.tsx';
import './estimate.css';

/** Secret estimate: the question and a big number field («4'478», «1,5» …). */
export function EstimateForm({
  prompt,
  unit,
  eyebrow = 'Geheim schätzen',
  tone = '#ffd23f',
  onSubmit,
}: {
  prompt: ReactNode;
  /** Shown next to the field, e.g. «m» – empty for years. */
  unit?: string;
  eyebrow?: string;
  tone?: string;
  onSubmit: (value: number) => void;
}) {
  const [text, setText] = useState('');
  const value = parseEstimate(text);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (value === null) return;
    sound.pop();
    onSubmit(value);
  };
  return (
    <Stage>
      <PromptCard eyebrow={eyebrow} tone={tone}>
        {prompt}
      </PromptCard>
      <form className="estimate-form" onSubmit={submit}>
        <div className="estimate-form__field">
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            inputMode="decimal"
            autoComplete="off"
            placeholder="Deine Schätzung"
            aria-label="Deine Schätzung"
            autoFocus
            enterKeyHint="done"
          />
          {unit && <span>{unit}</span>}
        </div>
        <Button type="submit" size="lg" block disabled={value === null}>
          Schätzung abgeben
        </Button>
      </form>
    </Stage>
  );
}

/** Animated count-up to the correct answer, with ticks that climb in pitch. */
export function CountUp({ from, to, format, onDone }: { from: number; to: number; format: (value: number) => string; onDone: () => void }) {
  const [value, setValue] = useState(from);
  const done = useRef(onDone);
  done.current = onDone;
  useEffect(() => {
    const start = performance.now();
    const duration = 1800;
    let raf = 0;
    let lastTick = 0;
    let step = 0;
    const frame = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      setValue(from + (to - from) * eased);
      // Ticks climb in pitch and slow down together with the number.
      if (now - lastTick > 55 + 160 * t && t < 1) {
        lastTick = now;
        sound.countTick(step++);
      }
      if (t < 1) raf = requestAnimationFrame(frame);
      else done.current();
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [from, to]);
  const decimals = Number.isInteger(to) ? 0 : 1;
  const shown = Number(value.toFixed(decimals));
  return <span className="countup">{format(shown)}</span>;
}
