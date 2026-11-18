import type { FastifyPluginAsync } from 'fastify';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { HttpError } from '../http.ts';

/**
 * Natural narrator voice: the app proxies to a Piper TTS service (separate
 * container, see tts/) and keeps every rendered sentence on disk, so each
 * sentence is synthesised only once.
 */
export interface TtsConfig {
  /** Base URL of the Piper HTTP server, e.g. http://tts:5000 */
  url: string;
  cacheDir: string;
  /** Upper bound for the disk cache. */
  maxCacheBytes?: number;
}

export const TTS_VOICES = [
  { id: 'thorsten', name: 'Thorsten', model: 'de_DE-thorsten-high' },
  { id: 'kerstin', name: 'Kerstin', model: 'de_DE-kerstin-medium' },
] as const;

export type TtsVoiceId = (typeof TTS_VOICES)[number]['id'];

const TEXT = /^[\p{L}\p{N}\s.,!?…:;'"«»„“”‘’()\-–—]+$/u;

const querySchema = z.object({
  voice: z.enum(TTS_VOICES.map((v) => v.id) as [TtsVoiceId, ...TtsVoiceId[]]),
  text: z
    .string()
    .transform((value) => value.replace(/\s+/g, ' ').trim())
    .pipe(z.string().min(1, 'Kein Text.').max(300, 'Der Text ist zu lang.').regex(TEXT, 'Ungültige Zeichen im Text.')),
});

const PRUNE_EVERY_MS = 10 * 60_000;

export const ttsRoutes: FastifyPluginAsync<{ rateLimit: boolean; tts: TtsConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const inFlight = new Map<string, Promise<Buffer>>();
  let lastPrune = 0;

  const config = (): TtsConfig => {
    if (!opts.tts) throw new HttpError(503, 'tts_unavailable', 'Die Erzählstimme ist auf diesem Server nicht eingerichtet.');
    return opts.tts;
  };

  /** Keeps the cache below its limit by removing the least recently written files. */
  async function prune({ cacheDir, maxCacheBytes = 500 * 1024 * 1024 }: TtsConfig): Promise<void> {
    if (Date.now() - lastPrune < PRUNE_EVERY_MS) return;
    lastPrune = Date.now();
    const names = await fs.readdir(cacheDir);
    const files = await Promise.all(
      names
        .filter((name) => name.endsWith('.wav'))
        .map(async (name) => ({ file: path.join(cacheDir, name), stat: await fs.stat(path.join(cacheDir, name)) })),
    );
    let total = files.reduce((sum, f) => sum + f.stat.size, 0);
    files.sort((a, b) => a.stat.mtimeMs - b.stat.mtimeMs);
    for (const f of files) {
      if (total <= maxCacheBytes * 0.8) break;
      await fs.rm(f.file, { force: true });
      total -= f.stat.size;
    }
  }

  async function synthesize(tts: TtsConfig, model: string, text: string, file: string): Promise<Buffer> {
    let response: Response;
    try {
      response = await fetch(new URL('/synthesize', tts.url), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: model }),
        signal: AbortSignal.timeout(20_000),
      });
    } catch (error) {
      app.log.warn({ err: error }, 'tts service unreachable');
      throw new HttpError(503, 'tts_unavailable', 'Die Erzählstimme ist gerade nicht erreichbar.');
    }
    const audio = Buffer.from(await response.arrayBuffer());
    if (!response.ok || audio.subarray(0, 4).toString('ascii') !== 'RIFF') {
      app.log.warn({ status: response.status }, 'tts service returned no audio');
      throw new HttpError(503, 'tts_unavailable', 'Die Erzählstimme ist gerade nicht erreichbar.');
    }
    await fs.mkdir(tts.cacheDir, { recursive: true });
    const temp = `${file}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp`;
    await fs.writeFile(temp, audio);
    await fs.rename(temp, file);
    void prune(tts).catch((error: unknown) => app.log.warn({ err: error }, 'tts cache prune failed'));
    return audio;
  }

  app.get('/', { preHandler: app.requireAccess, config: limit(900) }, async (request, reply) => {
    const tts = config();
    const { voice, text } = querySchema.parse(request.query);
    const model = TTS_VOICES.find((v) => v.id === voice)!.model;
    const key = crypto.createHash('sha256').update(`${model}\n${text}`).digest('base64url');
    const file = path.join(tts.cacheDir, `${key}.wav`);

    let audio: Buffer;
    try {
      audio = await fs.readFile(file);
    } catch {
      let pending = inFlight.get(key);
      if (!pending) {
        pending = synthesize(tts, model, text, file).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
      }
      audio = await pending;
    }
    return reply
      .header('Content-Type', 'audio/wav')
      .header('Cache-Control', 'private, max-age=31536000, immutable')
      .send(audio);
  });
};
