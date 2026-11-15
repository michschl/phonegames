/**
 * German text-to-speech via the Web Speech API.
 *
 * Quality depends almost entirely on the voice, so we rank the device's German
 * voices: neural/natural, premium and enhanced voices first, novelty voices
 * (iOS "Eddy", "Grandma" …) never, dated desktop voices last. Text is spoken
 * sentence by sentence with short pauses, which sounds more like a narrator and
 * avoids Chrome cutting off long utterances. Online voices fall back to an
 * on-device voice when they fail (e.g. offline).
 */
import { useSettings } from '../store/settings.ts';

export type VoiceQuality = 'natural' | 'enhanced' | 'standard';

export interface VoiceInfo {
  id: string;
  name: string;
  region: string;
  quality: VoiceQuality;
  online: boolean;
  score: number;
  voice: SpeechSynthesisVoice;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  /** Use this voice instead of the preferred one (voice preview). */
  voiceId?: string | null;
}

/** Novelty / effect voices that nobody wants as a narrator. */
const NOVELTY =
  /eloquence|\b(eddy|flo|grandma|grandpa|reed|rocko|sandy|shelley|albert|bad news|bahh|bells|boing|bubbles|cellos|good news|jester|organ|superstar|trinoids|whisper|wobble|zarvox|fred|junior|kathy|ralph)\b/i;
/** Old robotic engines – only used when nothing else is installed. */
const DATED = /espeak|pico|\bmicrosoft (hedda|katja|stefan)\b(?!.*online)/i;
const GOOD_NAMES = /\b(anna|helena|petra|markus|martin|viktor|yannick|katja|conrad|amala|leni|jan|ingrid|jonas|seraphina|florian)\b/i;

const REGIONS: Record<string, string> = { ch: 'Schweiz', de: 'Deutschland', at: 'Österreich', li: 'Liechtenstein', lu: 'Luxemburg' };

export function speechAvailable(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

function qualityOf(text: string): VoiceQuality {
  if (/natural|neural|wavenet|studio|journey|premium|siri/i.test(text)) return 'natural';
  if (/enhanced|erweitert|verbessert|google/i.test(text)) return 'enhanced';
  return 'standard';
}

function displayName(voice: SpeechSynthesisVoice): string {
  return (
    voice.name
      .replace(/^Microsoft\s+/i, '')
      .replace(/\s+Online\s*\(Natural\)/i, '')
      .replace(/\s*[-–]\s*German.*$/i, '')
      .replace(/\s*\((Deutsch|German|Enhanced|Erweitert|Premium|Verbessert)[^)]*\)+/gi, '')
      .trim() || voice.name
  );
}

function describe(voice: SpeechSynthesisVoice): VoiceInfo {
  const text = `${voice.name} ${voice.voiceURI}`;
  const lang = voice.lang.toLowerCase().replace('_', '-');
  const regionCode = lang.split('-')[1] ?? '';
  const quality = qualityOf(text);
  let score = { natural: 100, enhanced: 60, standard: 20 }[quality];
  score += regionCode === 'ch' ? 6 : regionCode === 'de' ? 5 : regionCode === 'at' ? 4 : 1;
  if (GOOD_NAMES.test(voice.name)) score += 5;
  if (/compact/i.test(text)) score -= 5;
  if (DATED.test(text)) score -= 40;
  if (voice.localService) score += 3;
  if (voice.default) score += 1;
  return {
    id: voice.voiceURI || voice.name,
    name: displayName(voice),
    region: REGIONS[regionCode] ?? '',
    quality,
    online: !voice.localService,
    score,
    voice,
  };
}

/* ------------------------------------------------------------- voice list */

let voices: VoiceInfo[] = [];
const listeners = new Set<() => void>();

/** German voices without novelty voices, best first. */
export function rankGermanVoices(list: readonly SpeechSynthesisVoice[]): VoiceInfo[] {
  return list
    .filter((v) => v.lang.toLowerCase().startsWith('de') && !NOVELTY.test(`${v.name} ${v.voiceURI}`))
    .map(describe)
    .sort((a, b) => b.score - a.score);
}

/** Re-reads the installed voices (e.g. after the user installed a new one). */
export function refreshVoices(): void {
  if (!speechAvailable()) return;
  const next = rankGermanVoices(window.speechSynthesis.getVoices());
  const changed = next.length !== voices.length || next.some((v, i) => v.id !== voices[i]?.id);
  voices = next;
  if (changed) listeners.forEach((listener) => listener());
}

if (speechAvailable()) {
  refreshVoices();
  window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  // Not every browser fires "voiceschanged" when a voice is installed while the app is in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshVoices();
  });
}

/** German voices of this device, best first. */
export function germanVoices(): VoiceInfo[] {
  return voices;
}

export function onVoicesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bestLocal(): VoiceInfo | undefined {
  return voices.find((v) => !v.online);
}

/** The chosen voice, or the best one available right now. */
export function currentVoice(voiceId?: string | null): VoiceInfo | undefined {
  if (!voices.length) refreshVoices();
  const wanted = voiceId === undefined ? useSettings.getState().voiceId : voiceId;
  const chosen = (wanted && voices.find((v) => v.id === wanted)) || voices[0];
  if (chosen?.online && typeof navigator !== 'undefined' && navigator.onLine === false) return bestLocal() ?? chosen;
  return chosen;
}

/* ---------------------------------------------------------------- speaking */

/** Splits text into sentences and gives each a pause that suits its ending. */
export function splitSentences(text: string): { text: string; pause: number }[] {
  const clean = text
    .replace(/[\p{Extended_Pictographic}\u{FE0F}]/gu, '')
    .replace(/\s+[–—]\s+/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
  const parts = clean.match(/[^.!?…]+(?:[.!?…]+|$)/g) ?? [clean];
  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => ({ text: part, pause: /(…|\.\.\.)$/.test(part) ? 700 : /[!?]$/.test(part) ? 380 : 260 }));
}

let generation = 0;
let queue: Promise<void> = Promise.resolve();
let primed = false;

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/** Speaks one sentence. Resolves `false` when an online voice failed and a retry makes sense. */
function utter(text: string, voice: VoiceInfo | undefined, rate: number, pitch: number): Promise<boolean> {
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.voice.lang ?? 'de-DE';
    if (voice) utterance.voice = voice.voice;
    utterance.rate = rate;
    utterance.pitch = pitch;
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(fallback);
      resolve(ok);
    };
    // Some browsers never fire "end" – resolve after a generous estimate.
    const fallback = window.setTimeout(() => finish(true), 2500 + (text.length * 110) / rate);
    utterance.onend = () => finish(true);
    utterance.onerror = (event) => finish(!(voice?.online && event.error !== 'interrupted' && event.error !== 'canceled'));
    window.speechSynthesis.resume();
    window.speechSynthesis.speak(utterance);
  });
}

async function run(text: string, options: SpeakOptions, token: number): Promise<void> {
  const rate = options.rate ?? 0.96;
  const pitch = options.pitch ?? 1;
  let voice = currentVoice(options.voiceId);
  const parts = splitSentences(text);
  for (const [index, part] of parts.entries()) {
    if (token !== generation) return;
    const ok = await utter(part.text, voice, rate, pitch);
    if (!ok && token === generation) {
      // Online voice failed (offline, network hiccup): continue with an on-device voice.
      voice = bestLocal();
      await utter(part.text, voice, rate, pitch);
    }
    if (index < parts.length - 1 && token === generation) await wait(part.pause);
  }
}

/**
 * Speaks German text. Calls are queued, so several announcements in a row are
 * read one after the other. Resolves when this text has been spoken.
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if (!speechAvailable() || !text.trim()) return Promise.resolve();
  const token = generation;
  const next = queue.then(() => (token === generation ? run(text, options, token) : undefined));
  queue = next.catch(() => undefined);
  return queue;
}

/** Stops the current sentence and drops everything still queued. */
export function stopSpeaking(): void {
  if (!speechAvailable()) return;
  generation += 1;
  queue = Promise.resolve();
  window.speechSynthesis.cancel();
}

/**
 * iOS only lets a page speak after it spoke once inside a user gesture.
 * Call this synchronously from a tap that leads to narration.
 */
export function primeSpeech(): void {
  if (primed || !speechAvailable()) return;
  primed = true;
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

export function previewVoice(voiceId: string | null): Promise<void> {
  stopSpeaking();
  primed = true;
  return speak('Willkommen im Dorf. Wenn die Nacht hereinbricht, schliessen alle die Augen …', { voiceId });
}
