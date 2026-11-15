/**
 * German narrator voice.
 *
 * Two sources:
 * 1. Phonegames voices – natural neural voices (Piper) rendered on our server
 *    and played via Web Audio. They sound the same on every device, also on
 *    iPhones (where web pages may only use Apple's built-in voices). Every
 *    sentence is kept in the Cache Storage, so known lines also play offline.
 * 2. Device voices via the Web Speech API. We rank them: neural/natural,
 *    premium and enhanced voices first, novelty voices (iOS "Eddy",
 *    "Grandma" …) never, dated desktop voices last.
 *
 * Text is spoken sentence by sentence with short pauses. Whenever a sentence
 * cannot be played with a Phonegames voice (offline and not cached, server
 * down), the best device voice reads it instead.
 */
import { useSettings } from '../store/settings.ts';
import { sound } from './audio.ts';
import { loadAuthOptions } from './authOptions.ts';

export type VoiceQuality = 'natural' | 'enhanced' | 'standard';

export interface VoiceInfo {
  id: string;
  name: string;
  region: string;
  quality: VoiceQuality;
  online: boolean;
  score: number;
  /** Rendered on the Phonegames server (true) or by the device's speech engine. */
  server: boolean;
  /** Device voices only. */
  voice?: SpeechSynthesisVoice;
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

const SERVER_PREFIX = 'phonegames:';
const AUDIO_CACHE = 'phonegames-voice-v1';

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
    server: false,
    voice,
  };
}

/** German device voices without novelty voices, best first. */
export function rankGermanVoices(list: readonly SpeechSynthesisVoice[]): VoiceInfo[] {
  return list
    .filter((v) => v.lang.toLowerCase().startsWith('de') && !NOVELTY.test(`${v.name} ${v.voiceURI}`))
    .map(describe)
    .sort((a, b) => b.score - a.score);
}

/* ------------------------------------------------------------- voice list */

let deviceVoices: VoiceInfo[] = [];
let serverVoices: VoiceInfo[] = [];
let allVoices: VoiceInfo[] = [];
const listeners = new Set<() => void>();

function publish(): void {
  allVoices = [...serverVoices, ...deviceVoices];
  listeners.forEach((listener) => listener());
}

/** Re-reads the device voices (e.g. after the user installed a new one) and the server voices. */
export function refreshVoices(): void {
  if (speechAvailable()) {
    const next = rankGermanVoices(window.speechSynthesis.getVoices());
    const changed = next.length !== deviceVoices.length || next.some((v, i) => v.id !== deviceVoices[i]?.id);
    deviceVoices = next;
    if (changed) publish();
  }
  if (!serverVoices.length) {
    loadAuthOptions()
      .then((options) => {
        const next = (options.tts?.voices ?? []).map(
          (v, i): VoiceInfo => ({
            id: `${SERVER_PREFIX}${v.id}`,
            name: v.name,
            region: 'Phonegames',
            quality: 'natural',
            online: true,
            score: 1000 - i,
            server: true,
          }),
        );
        if (next.length && !serverVoices.length) {
          serverVoices = next;
          publish();
        }
      })
      .catch(() => undefined);
  }
}

if (typeof window !== 'undefined') {
  refreshVoices();
  if (speechAvailable()) window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
  // Not every browser fires "voiceschanged" when a voice is installed while the app is in the background.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshVoices();
  });
  window.addEventListener('online', refreshVoices);
}

/** All voices to choose from: Phonegames voices first, then the device's German voices. */
export function germanVoices(): VoiceInfo[] {
  return allVoices;
}

export function onVoicesChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function bestDeviceVoice(): VoiceInfo | undefined {
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  return (offline && deviceVoices.find((v) => !v.online)) || deviceVoices[0];
}

/** The chosen voice, or the best one available right now. */
export function currentVoice(voiceId?: string | null): VoiceInfo | undefined {
  if (!deviceVoices.length) refreshVoices();
  const wanted = voiceId === undefined ? useSettings.getState().voiceId : voiceId;
  const chosen = (wanted && allVoices.find((v) => v.id === wanted)) || allVoices[0];
  if (chosen && !chosen.server && chosen.online && typeof navigator !== 'undefined' && navigator.onLine === false) {
    return bestDeviceVoice() ?? chosen;
  }
  return chosen;
}

/* ------------------------------------------------- Phonegames voice audio */

const decoded = new Map<string, Promise<AudioBuffer | null>>();
let playing: AudioBufferSourceNode | null = null;

const ttsUrl = (voice: VoiceInfo, text: string) =>
  `/api/tts?voice=${encodeURIComponent(voice.id.slice(SERVER_PREFIX.length))}&text=${encodeURIComponent(text)}`;

/** WAV of one sentence: from the Cache Storage, else from the server (and then cached). */
async function fetchAudio(url: string): Promise<ArrayBuffer | null> {
  try {
    const cache = 'caches' in window ? await caches.open(AUDIO_CACHE) : null;
    const hit = await cache?.match(url);
    if (hit) return await hit.arrayBuffer();
    if (!navigator.onLine) return null;
    const response = await fetch(url, { credentials: 'same-origin' });
    if (!response.ok) return null;
    if (cache) await cache.put(url, response.clone()).catch(() => undefined);
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/** Decoded audio of a sentence, shared between preloading and playback. */
function sentenceAudio(voice: VoiceInfo, text: string): Promise<AudioBuffer | null> {
  const url = ttsUrl(voice, text);
  let entry = decoded.get(url);
  if (!entry) {
    entry = fetchAudio(url).then(async (data) => {
      const ctx = sound.context ?? sound.unlock();
      if (!data || !ctx) return null;
      try {
        return await ctx.decodeAudioData(data);
      } catch {
        return null;
      }
    });
    // Failed attempts may succeed later (back online), so they are not remembered.
    entry.then((buffer) => buffer ?? decoded.delete(url)).catch(() => decoded.delete(url));
    decoded.set(url, entry);
    if (decoded.size > 300) decoded.delete(decoded.keys().next().value!);
  }
  return entry;
}

function playBuffer(buffer: AudioBuffer): Promise<void> {
  const ctx = sound.context ?? sound.unlock();
  if (!ctx) return Promise.resolve();
  if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
  return new Promise((resolve) => {
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    // Straight to the speakers: muting the sound effects must not silence the narrator.
    source.connect(ctx.destination);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.clearTimeout(fallback);
      if (playing === source) playing = null;
      resolve();
    };
    const fallback = window.setTimeout(finish, buffer.duration * 1000 + 1500);
    source.onended = finish;
    playing = source;
    source.start();
  });
}

/**
 * Loads sentences in the background (two at a time), so they play without delay
 * and are available offline later. Only does something for Phonegames voices.
 */
export async function preloadSpeech(texts: string[]): Promise<void> {
  const voice = currentVoice();
  if (!voice?.server) return;
  const queue = [...new Set(texts.flatMap((text) => splitSentences(text).map((part) => part.text)))];
  const worker = async () => {
    for (let text = queue.shift(); text !== undefined; text = queue.shift()) {
      if (!navigator.onLine) return;
      await sentenceAudio(voice, text);
    }
  };
  await Promise.all([worker(), worker()]);
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

/** Speaks one sentence with a device voice. Resolves `false` when an online voice failed and a retry makes sense. */
function utter(text: string, voice: VoiceInfo | undefined, rate: number, pitch: number): Promise<boolean> {
  if (!speechAvailable()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = voice?.voice?.lang ?? 'de-DE';
    if (voice?.voice) utterance.voice = voice.voice;
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
  // Phonegames voice: request all sentences at once, then play them in order.
  const audio = voice?.server ? parts.map((part) => sentenceAudio(voice!, part.text)) : [];

  for (const [index, part] of parts.entries()) {
    if (token !== generation) return;
    if (voice?.server) {
      const buffer = await audio[index];
      if (token !== generation) return;
      if (buffer) await playBuffer(buffer);
      else await utter(part.text, bestDeviceVoice(), rate, pitch); // not cached and offline, or server down
    } else {
      const ok = await utter(part.text, voice, rate, pitch);
      if (!ok && token === generation) {
        // Online device voice failed (offline, network hiccup): continue with an on-device voice.
        voice = deviceVoices.find((v) => !v.online);
        await utter(part.text, voice, rate, pitch);
      }
    }
    if (index < parts.length - 1 && token === generation) await wait(part.pause);
  }
}

/**
 * Speaks German text. Calls are queued, so several announcements in a row are
 * read one after the other. Resolves when this text has been spoken.
 */
export function speak(text: string, options: SpeakOptions = {}): Promise<void> {
  if ((!speechAvailable() && !serverVoices.length) || !text.trim()) return Promise.resolve();
  const token = generation;
  const next = queue.then(() => (token === generation ? run(text, options, token) : undefined));
  queue = next.catch(() => undefined);
  return queue;
}

/** Stops the current sentence and drops everything still queued. */
export function stopSpeaking(): void {
  generation += 1;
  queue = Promise.resolve();
  try {
    playing?.stop();
  } catch {
    /* already stopped */
  }
  playing = null;
  if (speechAvailable()) window.speechSynthesis.cancel();
}

/**
 * iOS only lets a page speak (and play audio) after a user gesture.
 * Call this synchronously from the tap that leads to narration.
 */
export function primeSpeech(): void {
  sound.unlock();
  if (primed || !speechAvailable()) return;
  primed = true;
  const silent = new SpeechSynthesisUtterance(' ');
  silent.volume = 0;
  window.speechSynthesis.speak(silent);
}

export function previewVoice(voiceId: string | null): Promise<void> {
  stopSpeaking();
  sound.unlock();
  primed = true;
  return speak('Willkommen im Dorf. Wenn die Nacht hereinbricht, schliessen alle die Augen …', { voiceId });
}
