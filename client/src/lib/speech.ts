/**
 * German text-to-speech via the Web Speech API (works offline with the
 * voices installed on the device). Resolves when the sentence is finished.
 */

let cachedVoice: SpeechSynthesisVoice | null | undefined;

function pickVoice(): SpeechSynthesisVoice | null {
  if (cachedVoice !== undefined && cachedVoice !== null) return cachedVoice;
  const voices = window.speechSynthesis?.getVoices() ?? [];
  const german = voices.filter((v) => v.lang.toLowerCase().startsWith('de'));
  cachedVoice =
    german.find((v) => v.lang.toLowerCase() === 'de-ch') ??
    german.find((v) => v.lang.toLowerCase() === 'de-de' && v.localService) ??
    german.find((v) => v.lang.toLowerCase() === 'de-de') ??
    german[0] ??
    null;
  return cachedVoice;
}

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

if (speechAvailable()) {
  window.speechSynthesis.addEventListener?.('voiceschanged', () => {
    cachedVoice = undefined;
  });
}

export function speak(text: string, { rate = 0.92 }: { rate?: number } = {}): Promise<void> {
  if (!speechAvailable()) return Promise.resolve();
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-CH';
    const voice = pickVoice();
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang;
    }
    utterance.rate = rate;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      resolve();
    };
    // Some browsers never fire "end" – resolve after a generous estimate.
    const fallback = window.setTimeout(finish, 1500 + text.length * 90);
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  });
}

export function stopSpeaking(): void {
  if (speechAvailable()) window.speechSynthesis.cancel();
}
