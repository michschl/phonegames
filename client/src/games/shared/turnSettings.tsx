import type { ReactNode } from 'react';
import { OptionRow } from './settings.tsx';

export interface TurnSettings {
  seconds: number;
  target: number;
}

/** Time per turn and points to win – shared by all team games. */
export function TurnSettingsRows<S extends TurnSettings>({
  value,
  onChange,
  seconds = [45, 60, 90],
  children,
}: {
  value: S;
  onChange: (next: S) => void;
  seconds?: number[];
  children?: ReactNode;
}) {
  return (
    <>
      {children}
      <OptionRow
        label="Zeit pro Zug"
        value={value.seconds}
        options={seconds.map((s) => ({ value: s, label: `${s} s` }))}
        onChange={(s) => onChange({ ...value, seconds: s })}
      />
      <OptionRow
        label="Gewonnen ab"
        value={value.target}
        options={[10, 15, 20, 30].map((t) => ({ value: t, label: `${t}`, hint: 'Punkte' }))}
        onChange={(target) => onChange({ ...value, target })}
      />
    </>
  );
}
