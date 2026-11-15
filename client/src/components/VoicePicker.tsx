import { useState, useSyncExternalStore } from 'react';
import { isIos } from '../lib/device.ts';
import { germanVoices, onVoicesChanged, previewVoice, speechAvailable, stopSpeaking, type VoiceInfo } from '../lib/speech.ts';
import { useSettings } from '../store/settings.ts';
import { Icon } from './Icon.tsx';

const QUALITY: Record<VoiceInfo['quality'], string> = {
  natural: 'Natürlich',
  enhanced: 'Verbessert',
  standard: 'Standard',
};

const VISIBLE = 5;

function useGermanVoices(): VoiceInfo[] {
  return useSyncExternalStore(onVoicesChanged, germanVoices, germanVoices);
}

function upgradeHint(best: VoiceInfo | undefined): string | null {
  if (best?.quality === 'natural') return null;
  if (isIos()) {
    return 'Tipp: Viel natürlichere Stimmen gibt’s gratis im iPhone unter Einstellungen → Bedienungshilfen → Gesprochene Inhalte → Stimmen → Deutsch. Lade z. B. «Anna (Premium)» und wähle sie dann hier aus.';
  }
  if (/android/i.test(navigator.userAgent)) {
    return 'Tipp: In den Android-Einstellungen unter «Sprachausgabe» die Google-Sprachausgabe wählen und die deutschen Sprachdaten (hohe Qualität) laden.';
  }
  return 'Tipp: In Microsoft Edge und Google Chrome stehen natürlich klingende Online-Stimmen zur Verfügung.';
}

/** Choose the narrator voice, with a spoken preview. */
export function VoicePicker() {
  const voices = useGermanVoices();
  const voiceId = useSettings((s) => s.voiceId);
  const setVoiceId = useSettings((s) => s.setVoiceId);
  const [expanded, setExpanded] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  if (!speechAvailable()) return <p className="settings-panel__hint">Dieser Browser hat keine Sprachausgabe.</p>;
  if (!voices.length) {
    return <p className="settings-panel__hint">Auf diesem Gerät ist keine deutsche Stimme installiert. {upgradeHint(undefined)}</p>;
  }

  const selected = voices.find((v) => v.id === voiceId) ?? null;
  const shown = expanded ? voices : voices.slice(0, VISIBLE);
  if (selected && !shown.includes(selected)) shown.push(selected);

  const play = async (id: string | null) => {
    if (playing === (id ?? 'auto')) {
      stopSpeaking();
      setPlaying(null);
      return;
    }
    setPlaying(id ?? 'auto');
    await previewVoice(id);
    setPlaying((current) => (current === (id ?? 'auto') ? null : current));
  };

  const choose = (id: string | null) => {
    setVoiceId(id);
    void play(id);
  };

  const option = (id: string | null, name: string, meta: string) => {
    const isSelected = id === null ? !selected : selected?.id === id;
    const key = id ?? 'auto';
    return (
      <li key={key} className={`voice-option ${isSelected ? 'is-selected' : ''}`}>
        <button type="button" className="voice-option__main" aria-pressed={isSelected} onClick={() => choose(id)}>
          <span className="voice-option__radio" aria-hidden="true">
            {isSelected && <Icon name="check" size={14} strokeWidth={3.2} />}
          </span>
          <span className="voice-option__text">
            <span className="voice-option__name">{name}</span>
            <span className="voice-option__meta">{meta}</span>
          </span>
        </button>
        <button
          type="button"
          className={`voice-option__play ${playing === key ? 'is-playing' : ''}`}
          aria-label={playing === key ? 'Hörprobe stoppen' : `Hörprobe: ${name}`}
          onClick={() => void play(id)}
        >
          <Icon name={playing === key ? 'x' : 'play'} size={16} />
        </button>
      </li>
    );
  };

  const hint = upgradeHint(voices[0]);
  return (
    <div className="voice-picker">
      <ul className="voice-picker__list">
        {option(null, 'Automatisch', `Beste Stimme: ${voices[0]!.name}`)}
        {shown.map((v) =>
          option(v.id, v.name, [QUALITY[v.quality], v.region, v.online ? 'online' : ''].filter(Boolean).join(' · ')),
        )}
      </ul>
      {voices.length > VISIBLE && (
        <button type="button" className="voice-picker__more" onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Weniger anzeigen' : `Alle ${voices.length} Stimmen anzeigen`}
        </button>
      )}
      {hint && <p className="settings-panel__hint">{hint}</p>}
    </div>
  );
}
