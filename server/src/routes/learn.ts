import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Database } from '../db.ts';
import { HttpError } from '../http.ts';
import { countLearnUsage, getLearnUsage, getTotalLearnUsage } from '../repo.ts';
import {
  LIMITS,
  type LearnCardKind,
  type LearnDraft,
  type LearnDraftCard,
  type LearnExtractMode,
  type LearnExtractResponse,
  type LearnMode,
  type LearnUsage,
} from '../../../shared/types.ts';
import { GAP, normalizeGap } from '../../../shared/learn.ts';

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
  /** Documents of «Aufgaben» (tests, tasks, practice exams) per person and calendar month. */
  taskMonthlyLimit?: number;
  timeoutMs?: number;
}

export const IMAGE = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
/** ~1.6 MB per photo after base64 – the app sends them downscaled to about 2000 px. */
export const MAX_IMAGE_CHARS = 2_200_000;

const extractSchema = z.object({
  images: z
    .array(z.string().max(MAX_IMAGE_CHARS, 'Ein Foto ist zu gross.').regex(IMAGE, 'Ungültiges Bild.'))
    .min(1, 'Bitte wähle mindestens ein Foto.')
    .max(LIMITS.learnPhotos, `Höchstens ${LIMITS.learnPhotos} Fotos auf einmal.`),
  /** exact = only what is on the photos, creative = new cards on the same topic. */
  mode: z.enum(['exact', 'creative']).default('exact'),
  /** Cards to invent in mode «creative». */
  count: z.number().int().min(5).max(30).default(20),
});

/* ------------------------------------------------------------- calendar */

const monthFormat = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Zurich', year: 'numeric', month: '2-digit' });

/** Calendar month in Switzerland, e.g. "2026-11". */
export function currentMonth(now = new Date()): string {
  const parts = monthFormat.formatToParts(now);
  return `${parts.find((p) => p.type === 'year')!.value}-${parts.find((p) => p.type === 'month')!.value}`;
}

export function nextMonthStart(month: string): string {
  const [year, mon] = month.split('-').map(Number) as [number, number];
  return mon === 12 ? `${year + 1}-01-01` : `${year}-${String(mon + 1).padStart(2, '0')}-01`;
}

/* --------------------------------------------------------------- prompt */

export const CARD_SCHEMA = {
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
          kind: { type: 'string', enum: ['translation', 'definition', 'qa', 'number', 'cloze'] },
          prompt: { type: 'string' },
          answer: { type: 'string' },
          accepted: { type: 'array', items: { type: 'string' } },
          distractors: { type: 'array', items: { type: 'string' } },
          uncertain: { type: 'string', description: 'Leer, oder Grund, warum die Karte geprüft werden muss' },
        },
      },
    },
    suggested_modes: { type: 'array', items: { type: 'string', enum: ['blitz', 'duell', 'kasten', 'schaetzen', 'luecke'] } },
    removed_personal_data: { type: 'boolean' },
  },
} as const;

export const BASE_RULES = `- Schreibe in Schweizer Rechtschreibung (ss statt ß), aber übernimm Fremdsprachen exakt mit allen Akzenten.
- Lass Namen von Personen, Noten, Unterschriften, Klassen und Daten weg. Setze dann removed_personal_data auf true.
- Eine Karte pro Lerninhalt. kind: translation = Wort/Ausdruck mit Übersetzung, definition = Begriff mit Erklärung,
  qa = Frage mit Antwort, number = Antwort ist eine Zahl oder Jahreszahl, cloze = Lückentext.
- number: answer enthält nur die Zahl, allenfalls mit Einheit (z. B. «1291», «4478 m», «26»).
- cloze: prompt ist ein ganzer Satz mit genau einer Lücke, geschrieben als ${GAP}; answer ist das fehlende Wort oder die
  kurze Wortgruppe. Nutze cloze für Lückentexte auf dem Blatt und für Merktexte (z. B. NMG, Geschichte, Biologie):
  pro Satz eine Karte, die Lücke ist das wichtigste Fachwort. Behalte die Reihenfolge des Textes. Steht bei einem
  Lückentext die Lösung nicht auf dem Blatt, setze die wahrscheinlichste Lösung ein und nenne in uncertain den Grund.
- Bei Wörtli steht im prompt das Wort in der Fremdsprache, in answer die Übersetzung. Mehrere gleichwertige Antworten
  (z. B. «viel, sehr») kommen als einzelne Einträge in accepted; answer enthält die Antwort wie auf dem Blatt.
- distractors: genau 3 plausible, aber falsche Antworten in derselben Sprache und Form wie answer (für ein Auswahl-Spiel),
  mit korrektem Artikel. Sie dürfen nicht ebenfalls richtig sein. Bei cloze: Wörter, die grammatikalisch in die Lücke
  passen, inhaltlich aber falsch sind.
- uncertain: leer lassen, ausser du konntest etwas nicht sicher lesen – dann kurz den Grund nennen.
- title: kurz und konkret (höchstens 60 Zeichen).
- suggested_modes: blitz (Teams, Antwort laut sagen) passt fast immer; duell (Auswahl aus vier) nur wenn gute falsche
  Antworten möglich sind; kasten (Lernkartei) passt immer; schaetzen (Schätzrunde) bei mindestens 3 number-Karten;
  luecke (Lückentext) bei mindestens 3 cloze-Karten.
- Wenn auf den Fotos kein Lernstoff zu sehen ist, gib eine leere Kartenliste zurück.
Antworte ausschliesslich mit JSON nach dem Schema.`;

const INTRO = 'Du erstellst aus Fotos von Schulunterlagen Lernkarten für ein Lernspiel für Kinder und Jugendliche in der Schweiz.';

/** Instructions for the model: take over exactly what is on the photos, or invent new cards on the same topic. */
export function systemPrompt(mode: LearnExtractMode, count = 20): string {
  if (mode === 'creative') {
    return `${INTRO}

Auftrag: NEUE AUFGABEN ERFINDEN.
- Erkenne auf den Fotos Fach, Thema, Schulstufe und Art der Aufgaben (z. B. Französisch-Wörtli einer Unit,
  Einmaleins, Lückentext zur Geografie der Schweiz, Jahreszahlen der Schweizer Geschichte).
- Erstelle genau ${count} neue Lernkarten zum selben Thema: dieselben Kartenarten (kind), dieselbe Sprachrichtung
  und dieselbe Schwierigkeit – z. B. weitere Wörter aus demselben Wortfeld, weitere Rechnungen derselben Art,
  weitere Sätze zum selben Stoff.
- Wiederhole keine Aufgabe von den Fotos – auch nicht umformuliert und nicht mit derselben Antwort. Nimm andere
  Fakten, Wörter, Zahlen oder Sätze aus demselben Stoff. Die Antwort darf nicht schon in der Frage stehen.
- Alles muss fachlich korrekt, sprachlich richtig (Artikel!) und für die Stufe passend sein. Bist du bei einer Karte
  nicht sicher, lass sie weg.
- title: das Thema mit dem Zusatz «Übung», z. B. «Unité 5 – Übung».

Regeln:
${BASE_RULES}`;
  }
  return `${INTRO}

Regeln:
- Übernimm nur Lerninhalte, die auf den Fotos stehen. Erfinde keine zusätzlichen Fragen oder Antworten.
${BASE_RULES}`;
}

/* ------------------------------------------------------------ sanitising */

const KINDS: readonly LearnCardKind[] = ['translation', 'definition', 'qa', 'number', 'cloze'];
const MODES: readonly LearnMode[] = ['blitz', 'duell', 'kasten', 'schaetzen', 'luecke'];

export const text = (value: unknown, max: number = LIMITS.cardText): string =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const texts = (value: unknown, max: number): string[] =>
  Array.isArray(value) ? [...new Set(value.map((v) => text(v)).filter(Boolean))].slice(0, max) : [];

/** Cuts a text at a word boundary and marks the cut with «…». */
export function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/** Turns the model's answer into a clean draft – whatever the model got wrong is dropped, not trusted. */
export function toDraft(raw: unknown, generated = false): LearnDraft {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const cards: LearnDraftCard[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.cards) ? data.cards : []) {
    if (!item || typeof item !== 'object') continue;
    const card = item as Record<string, unknown>;
    let prompt = text(card.prompt);
    const answer = text(card.answer);
    if (!prompt || !answer) continue;
    let kind: LearnCardKind = KINDS.includes(card.kind as LearnCardKind) ? (card.kind as LearnCardKind) : 'qa';
    // A number card needs a number in its answer («Alpen» is not one).
    if (kind === 'number' && !/\d/.test(answer)) kind = 'qa';
    // A Lückentext needs exactly one gap «___»; a sentence with a gap is a Lückentext whatever the model called it.
    if (kind === 'cloze' || /_{3,}/.test(prompt)) {
      const gapped = normalizeGap(prompt, answer);
      if (gapped) {
        prompt = gapped;
        kind = 'cloze';
      } else if (kind === 'cloze') {
        kind = 'qa';
      }
    }
    const key = `${prompt.toLowerCase()}\u0000${answer.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const same = (v: string) => v.toLowerCase() === answer.toLowerCase();
    const accepted = texts(card.accepted, 10).filter((v) => !same(v));
    const distractors = texts(card.distractors, 6)
      .filter((v) => !same(v) && !accepted.some((a) => a.toLowerCase() === v.toLowerCase()))
      .slice(0, 3);
    cards.push({
      kind,
      prompt,
      answer,
      accepted,
      distractors,
      uncertain: text(card.uncertain, 200),
    });
    if (cards.length >= LIMITS.cardsPerStack) break;
  }
  const modes = texts(data.suggested_modes, MODES.length).filter((m): m is LearnMode => MODES.includes(m as LearnMode));
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
    generated,
  };
}

/* ----------------------------------------------------------------- calls */

export class UpstreamError extends Error {}

/** One chat completion; returns the parsed JSON answer. Requests are never logged – they may contain photos. */
export async function chat(config: LearnConfig, body: Record<string, unknown>, what: string, log: FastifyBaseLogger): Promise<unknown> {
  const url = `${config.url.replace(/\/$/, '')}/2/ai/${encodeURIComponent(config.productId)}/openai/v1/chat/completions`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
      body: JSON.stringify({ model: config.model, ...body }),
      signal: AbortSignal.timeout(config.timeoutMs ?? 120_000),
    });
  } catch (error) {
    log.warn({ err: (error as Error).message }, 'learn: AI service not reachable');
    throw new UpstreamError('unreachable');
  }
  if (!response.ok) {
    log.warn({ status: response.status, body: (await response.text()).slice(0, 300) }, 'learn: AI service error');
    throw new UpstreamError(`status ${response.status}`);
  }
  const json = (await response.json()) as {
    choices?: { message?: { content?: string | null }; finish_reason?: string }[];
    usage?: unknown;
  };
  const choice = json.choices?.[0];
  log.info({ usage: json.usage, finish: choice?.finish_reason }, `learn: ${what} done`);
  try {
    return JSON.parse(choice?.message?.content ?? '');
  } catch {
    throw new UpstreamError('invalid json');
  }
}

async function callModel(
  config: LearnConfig,
  images: string[],
  options: { mode: LearnExtractMode; count: number },
  log: FastifyBaseLogger,
): Promise<unknown> {
  return chat(
    config,
    {
      messages: [
        { role: 'system', content: systemPrompt(options.mode, options.count) },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text:
                options.mode === 'creative'
                  ? `Hier sind ${images.length} Foto(s). Erfinde ${options.count} neue Lernkarten zum selben Thema.`
                  : `Hier sind ${images.length} Foto(s). Erstelle die Lernkarten.`,
            },
            ...images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'lernstapel', strict: true, schema: CARD_SCHEMA } },
      // Thinking would use up the whole output budget before any card is written.
      reasoning_effort: 'none',
      // Taking over needs precision; inventing a little variety.
      temperature: options.mode === 'creative' ? 0.7 : 0.2,
      max_tokens: 8000,
    },
    'analysis',
    log,
  );
}

const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['checks'],
  properties: {
    checks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'correct', 'reason'],
        properties: { index: { type: 'integer' }, correct: { type: 'boolean' }, reason: { type: 'string' } },
      },
    },
  },
} as const;

export const CHECK_PROMPT = `Du bist eine kritische Lehrperson in der Schweiz und prüfst Lernkarten auf fachliche Richtigkeit.
Prüfe jede Karte einzeln: Ist die Antwort richtig, und ist die ganze Aussage im Satz (auch Nebenaussagen wie
«der längste», «verbindet A und B») korrekt und eindeutig? correct = false, sobald etwas daran falsch, irreführend
oder mehrdeutig ist, wenn die Antwort schon in der Frage steht oder ein Artikel bzw. die Grammatik falsch ist.
reason nennt dann in einem kurzen Satz den Fehler (bei Sprachfehlern die richtige Form). Antworte nur mit JSON.`;

/**
 * Invented cards get a second, text-only look by the same model: a fresh check finds
 * many of its own mistakes (e.g. a wrong «longest river»). Returns the reason per card index.
 */
export async function checkCards(config: LearnConfig, cards: LearnDraftCard[], log: FastifyBaseLogger): Promise<Map<number, string>> {
  const raw = (await chat(
    config,
    {
      messages: [
        { role: 'system', content: CHECK_PROMPT },
        { role: 'user', content: cards.map((card, i) => `${i}. Frage/Satz: ${card.prompt} | Antwort: ${card.answer}`).join('\n') },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'pruefung', strict: true, schema: CHECK_SCHEMA } },
      reasoning_effort: 'none',
      temperature: 0,
      max_tokens: 4000,
    },
    'check',
    log,
  )) as { checks?: unknown };
  const issues = new Map<number, string>();
  for (const item of Array.isArray(raw?.checks) ? raw.checks : []) {
    const check = item as { index?: unknown; correct?: unknown; reason?: unknown };
    if (check.correct !== false || typeof check.index !== 'number' || !cards[check.index]) continue;
    issues.set(check.index, shorten(text(check.reason, 400), 150) || 'Bitte die Fakten prüfen.');
  }
  return issues;
}

/** Checks the first bytes, so only real images are passed on. */
export function looksLikeImage(dataUrl: string): boolean {
  const match = IMAGE.exec(dataUrl);
  if (!match) return false;
  const head = Buffer.from(match[2]!.slice(0, 24), 'base64');
  if (match[1] === 'jpeg') return head[0] === 0xff && head[1] === 0xd8;
  if (match[1] === 'png') return head.subarray(0, 4).toString('hex') === '89504e47';
  return head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP';
}

/** Analyses (photos of stacks and topics) left this month for a person. */
export function learnUsage(db: Database, config: LearnConfig | null, userId: string): LearnUsage {
  const month = currentMonth();
  const limitPerMonth = config?.monthlyLimit ?? 0;
  const used = getLearnUsage(db, userId, month);
  return {
    available: !!config,
    used,
    limit: limitPerMonth,
    remaining: Math.max(0, limitPerMonth - used),
    resetsOn: nextMonthStart(month),
    maxPhotos: LIMITS.learnPhotos,
  };
}

/** Throws when the person or all accounts together have used up this month's analyses. */
export function assertAnalysisLeft(db: Database, config: LearnConfig, userId: string): void {
  const usage = learnUsage(db, config, userId);
  if (usage.remaining <= 0) {
    throw new HttpError(
      429,
      'learn_limit',
      `Du hast diesen Monat alle ${usage.limit} Auswertungen gebraucht. Ab dem ${formatDay(usage.resetsOn)} geht es wieder.`,
    );
  }
  if (getTotalLearnUsage(db, currentMonth()) >= config.globalMonthlyLimit) {
    throw new HttpError(503, 'learn_busy', 'Die KI-Auswertung ist für diesen Monat ausgeschöpft. Versuch es nächsten Monat wieder.');
  }
}

/* ---------------------------------------------------------------- routes */

export const learnRoutes: FastifyPluginAsync<{ rateLimit: boolean; learn: LearnConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const running = new Set<string>();

  const usageFor = (userId: string): LearnUsage => learnUsage(app.db, opts.learn, userId);

  app.get('/usage', { preHandler: app.requireAccess, config: limit(120) }, async (request): Promise<LearnUsage> =>
    usageFor(request.user!.id),
  );

  app.post(
    '/extract',
    { preHandler: app.requireAccess, config: limit(20), bodyLimit: 16 * 1024 * 1024 },
    async (request): Promise<LearnExtractResponse> => {
      const learn = opts.learn;
      if (!learn) {
        throw new HttpError(503, 'learn_unavailable', 'Die Foto-Auswertung ist auf diesem Server nicht eingerichtet.');
      }
      const userId = request.user!.id;
      const { images, mode, count } = extractSchema.parse(request.body);
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
            draft = toDraft(await callModel(learn, images, { mode, count }, request.log), mode === 'creative');
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
        if (mode === 'creative') {
          // Invented facts are checked once more; doubtful cards are marked for the review, not dropped.
          try {
            const issues = await checkCards(learn, draft.cards, request.log);
            for (const [index, reason] of issues) draft.cards[index]!.uncertain = `Möglicherweise falsch – ${reason}`.slice(0, 200);
          } catch (error) {
            if (!(error instanceof UpstreamError)) throw error;
            // Without the check the cards stay as they are – the review asks to check them anyway.
          }
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

export function formatDay(isoDay: string): string {
  const [year, month, day] = isoDay.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('de-CH', {
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  });
}
