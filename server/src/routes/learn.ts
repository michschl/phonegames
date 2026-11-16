import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../http.ts';
import { countLearnUsage, getLearnUsage, getTotalLearnUsage } from '../repo.ts';
import {
  LIMITS,
  type LearnCardKind,
  type LearnDraft,
  type LearnDraftCard,
  type LearnExtractResponse,
  type LearnMode,
  type LearnUsage,
} from '../../../shared/types.ts';

/**
 * Photo analysis for the learning stacks: the photos are passed on to an
 * OpenAI-compatible vision model (Infomaniak AI, data centres in Switzerland)
 * and come back as learning cards. Photos are never stored or logged.
 */
export interface LearnConfig {
  /** Base URL, e.g. https://api.infomaniak.com */
  url: string;
  productId: string;
  token: string;
  model: string;
  /** Analyses per person and calendar month. */
  monthlyLimit: number;
  /** Safety net: analyses per calendar month over all accounts. */
  globalMonthlyLimit: number;
  timeoutMs?: number;
}

const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
/** ~1.6 MB per photo after base64 – the app sends them downscaled to about 2000 px. */
const MAX_IMAGE_CHARS = 2_200_000;

const extractSchema = z.object({
  images: z
    .array(z.string().max(MAX_IMAGE_CHARS, 'Ein Foto ist zu gross.').regex(IMAGE, 'Ungültiges Bild.'))
    .min(1, 'Bitte wähle mindestens ein Foto.')
    .max(LIMITS.learnPhotos, `Höchstens ${LIMITS.learnPhotos} Fotos auf einmal.`),
});

/* ------------------------------------------------------------- calendar */

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' });

/** Calendar month in Switzerland, e.g. "2026-11". */
export function currentMonth(now = new Date()): string {
  const parts = monthFormat.formatToParts(now);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

function nextMonthStart(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
}

/* --------------------------------------------------------------- prompt */

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'languages', 'cards', 'suggested_modes', 'removed_personal_data'],
  properties: {
    title: { type: 'string', description: 'Kurzer Titel des Stapels, z. B. «Unité 5 – Vocabulaire»' },
    subject: { type: 'string', description: 'Schulfach, z. B. Französisch, Geografie, Mathematik' },
    languages: {
      type: 'array',
      items: { type: 'string' },
      description: 'Bei Wörtli: [Sprache der Frage, Sprache der Antwort] als ISO-Codes, sonst leer',
    },
    cards: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['kind', 'prompt', 'answer', 'accepted', 'distractors', 'uncertain'],
        properties: {
          kind: { type: 'string', enum: ['translation', 'definition', 'qa', 'number'] },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          accepted: { type: 'array', items: { type: 'string' } },
          distractors: { type: 'array', items: { type: 'string' } },
          uncertain: { type: 'string', description: 'Leer, oder Grund, warum die Karte geprüft werden muss' },
        },
      },
    },
    suggested_modes: { type: 'array', items: { type: 'string', enum: ['blitz', 'duell', 'kasten'] } },
    removed_personal_data: { type: 'boolean' },
  },
} as const;

export const SYSTEM_PROMPT = `Du erstellst aus Fotos von Schulunterlagen Lernkarten für ein Lernspiel für Kinder und Jugendliche in der Schweiz.

Regeln:
- Übernimm nur Lerninhalte, die auf den Fotos stehen. Erfinde keine zusätzlichen Fragen oder Antworten.
- Schreibe in Schweizer Rechtschreibung (ss statt ß), aber übernimm Fremdsprachen exakt mit allen Akzenten.
- Lass Namen von Personen, Noten, Unterschriften, Klassen und Daten weg. Setze dann removed_personal_data auf true.
- Eine Karte pro Lerninhalt. kind: translation = Wort/Ausdruck mit Übersetzung, definition = Begriff mit Erklärung,
  qa = Frage mit Antwort, number = Antwort ist eine Zahl oder Jahreszahl.
- Bei Wörtli steht im prompt das Wort in der Fremdsprache, in answer die Übersetzung. Mehrere gleichwertige Antworten
  (z. B. «viel, sehr») kommen als einzelne Einträge in accepted; answer enthält die Antwort wie auf dem Blatt.
- distractors: genau 3 plausible, aber falsche Antworten in derselben Sprache und Form wie answer (für ein Auswahl-Spiel),
  mit korrektem Artikel. Sie dürfen nicht ebenfalls richtig sein.
- uncertain: leer lassen, ausser du konntest etwas nicht sicher lesen – dann kurz den Grund nennen.
- title: kurz und konkret (höchstens 60 Zeichen).
- suggested_modes: blitz (Teams, Antwort laut sagen) passt fast immer; duell (Auswahl aus vier) nur wenn gute falsche
  Antworten möglich sind; kasten (Lernkartei) passt immer.
- Wenn auf den Fotos kein Lernstoff zu sehen ist, gib eine leere Kartenliste zurück.
Antworte ausschliesslich mit JSON nach dem Schema.`;

/* ------------------------------------------------------------ sanitising */

const KINDS: readonly LearnCardKind[] = ['translation', 'definition', 'qa', 'number'];
const MODES: readonly LearnMode[] = ['blitz', 'duell', 'kasten'];

const text = (value: unknown, max: number = LIMITS.cardText): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const texts = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? [...new Set(value.map((v) => text(v)).filter(Boolean))].slice(0, max) : [];

/** Turns the model's answer into a clean draft – whatever the model got wrong is dropped, not trusted. */
export function toDraft(raw: unknown): LearnDraft {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cards: LearnDraftCard[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.cards) ? data.cards : []) {
    if (!item || typeof item !== 'object') continue;
    const card = item as Record<string, unknown>;
    const prompt = text(card.prompt);
    const answer = text(card.answer);
    if (!prompt || !answer) continue;
    const key = `${prompt.toLowerCase()}\u0000${answer.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const same = (v: string) => v.toLowerCase() === answer.toLowerCase();
    const accepted = texts(card.accepted, 10).filter((v) => !same(v));
    const distractors = texts(card.distractors, 6)
      .filter((v) => !same(v) && !accepted.some((a) => a.toLowerCase() === v.toLowerCase()))
      .slice(0, 3);
    cards.push({
      kind: KINDS.includes(card.kind as LearnCardKind) ? (card.kind as LearnCardKind) : 'qa',
      prompt,
      answer,
      accepted,
      distractors,
      uncertain: text(card.uncertain, 200),
    });
    if (cards.length >= LIMITS.cardsPerStack) break;
  }
  const modes = texts(data.suggested_modes, 3).filter((m): m is LearnMode => MODES.includes(m as LearnMode));
  if (!modes.includes('kasten')) modes.push('kasten');
  const languages = texts(data.languages, 2)
    .map((l) => l.toLowerCase())
    .filter((l) => /^[a-z]{2,3}$/.test(l));
  return {
    title: text(data.title, LIMITS.stackTitleMax) || 'Neuer Stapel',
    subject: text(data.subject, 40),
    languages: languages.length === 2 ? languages : [],
    cards,
    suggestedModes: MODES.filter((m) => modes.includes(m)),
    removedPersonalData: data.removed_personal_data === true,
  };
}

/* ----------------------------------------------------------------- calls */

class UpstreamError extends Error {}

async function callModel(config: LearnConfig, images: string[], log: FastifyBaseLogger): Promise<unknown> {
  const url = `${config.url.replace(/\/$/, '')}/2/ai/${encodeURIComponent(config.productId)}/openai/v1/chat/completions`;
  const body = {
    model: config.model,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: `Hier sind ${images.length} Foto(s). Erstelle die Lernkarten.` },
          ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
        ],
      },
    ],
    response_format: { type: 'json_schema', json_schema: { name: 'lernstapel', strict: true, schema: SCHEMA } },
    // Thinking would use up the whole output budget before any card is written.
    reasoning_effort: 'none',
    temperature: 0.2,
    max_tokens: 8000,
  };
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
    });
  } catch (error) {
    log.warn({ err: (error as Error).message }, 'learn: AI service not reachable');
    throw new UpstreamError('unreachable');
  }
  if (!response.ok) {
    // Never log the request – it contains the photos.
    log.warn({ status: response.status, body: (await response.text()).slice(0, 300) }, 'learn: AI service error');
    throw new UpstreamError(`status ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: unknown;
  };
  const choice = json.choices?.[0];
  log.info({ usage: json.usage, finish: choice?.finish_reason }, 'learn: analysis done');
  try {
    return JSON.parse(choice?.message?.content ?? '');
  } catch {
    throw new UpstreamError('invalid json');
  }
}

/** Checks the first bytes, so only real images are passed on. */
function looksLikeImage(dataUrl: string): boolean {
  const match = IMAGE.exec(dataUrl);
  if (!match) return false;
  const head = Buffer.from(match[2]!.slice(0, 24), 'base64');
  if (match[1] === 'jpeg') return head[0] === 0xff && head[1] === 0xd8;
  if (match[1] === 'png') return head.subarray(0, 4).toString('hex') === '89504e47';
  return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
}

/* ---------------------------------------------------------------- routes */

export const learnRoutes: FastifyPluginAsync<{ rateLimit: boolean; learn: LearnConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const running = new Set<string>();

  const usageFor = (userId: string): LearnUsage => {
    const month = currentMonth();
    const limitPerMonth = opts.learn?.monthlyLimit ?? 0;
    const used = getLearnUsage(app.db, userId, month);
    return {
      available: !!opts.learn,
      used,
      limit: limitPerMonth,
      remaining: Math.max(0, limitPerMonth - used),
      resetsOn: nextMonthStart(month),
      maxPhotos: LIMITS.learnPhotos,
    };
  };

  app.get('/usage', { preHandler: app.requireAuth, config: limit(120) }, async (request): Promise<LearnUsage> =>
    usageFor(request.user!.id),
  );

  app.post(
    '/extract',
    { preHandler: app.requireAuth, config: limit(20), bodyLimit: 16 * 1024 * 1024 },
    async (request): Promise<LearnExtractResponse> => {
      const learn = opts.learn;
      if (!learn) {
        throw new HttpError(503, 'learn_unavailable', 'Die Foto-Auswertung ist auf diesem Server nicht eingerichtet.');
      }
      const userId = request.user!.id;
      const { images } = extractSchema.parse(request.body);
      if (!images.every(looksLikeImage)) throw new HttpError(400, 'invalid_image', 'Mindestens ein Foto ist kein gültiges Bild.');

      const usage = usageFor(userId);
      if (usage.remaining <= 0) {
        throw new HttpError(
          429,
          'learn_limit',
          `Du hast diesen Monat alle ${usage.limit} Auswertungen gebraucht. Ab dem ${formatDay(usage.resetsOn)} geht es wieder.`,
        );
      }
      if (getTotalLearnUsage(app.db, currentMonth()) >= learn.globalMonthlyLimit) {
        throw new HttpError(503, 'learn_busy', 'Die Foto-Auswertung ist für diesen Monat ausgeschöpft. Du kannst Karten als Text erfassen.');
      }
      if (running.has(userId)) throw new HttpError(429, 'learn_running', 'Eine Auswertung läuft bereits.');

      running.add(userId);
      try {
        let draft: LearnDraft | null = null;
        // One retry when the service fails or answers with broken JSON.
        for (let attempt = 0; attempt < 2 && !draft; attempt++) {
          try {
            draft = toDraft(await callModel(learn, images, request.log));
          } catch (error) {
            if (!(error instanceof UpstreamError)) throw error;
            if (attempt === 1) {
              throw new HttpError(502, 'learn_failed', 'Die Auswertung hat leider nicht geklappt. Versuch es nochmals.');
            }
          }
        }
        if (!draft || draft.cards.length === 0) {
          throw new HttpError(422, 'learn_empty', 'Auf den Fotos habe ich keinen Lernstoff gefunden. Versuch es mit schärferen Fotos.');
        }
        // Only successful analyses count towards the limit.
        countLearnUsage(app.db, userId, currentMonth());
        return { draft, usage: usageFor(userId) };
      } finally {
        running.delete(userId);
      }
    },
  );
};

function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
