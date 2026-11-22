import type { FastifyBaseLogger, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { HttpError } from '../http.ts';
import { countLearnUsage } from '../repo.ts';
import { LIMITS, TOPIC_LEVELS, type TopicDraft, type TopicDraftResponse } from '../../../shared/types.ts';
import {
  assertAnalysisLeft,
  chat,
  IMAGE,
  learnUsage,
  looksLikeImage,
  MAX_IMAGE_CHARS,
  text,
  UpstreamError,
  currentMonth,
  type LearnConfig,
} from './learn.ts';

/*
 * «Aufgaben»: larger topics for a test. From photos of learning goals, book pages or worksheets –
 * or from keywords – the AI writes the learning goals with their core content (Lehrplan 21, for the
 * school level). Tests, tasks and practice exams are made from these goals later.
 * Photos are passed on to the AI (Infomaniak, Switzerland) and never stored or logged.
 */

/** Lehrplan 21 cycle (or school type) of a level – helps the AI write for the right age. */
export function levelHint(level: string): string {
  const index = (TOPIC_LEVELS as readonly string[]).indexOf(level);
  if (index >= 0 && index <= 1) return `${level}, Primarschule, Lehrplan 21 Zyklus 1`;
  if (index >= 2 && index <= 5) return `${level}, Primarschule, Lehrplan 21 Zyklus 2`;
  if (index >= 6 && index <= 8) return `${level}, Sekundarstufe I, Lehrplan 21 Zyklus 3`;
  if (level === 'Gymnasium') return 'Gymnasium (Maturitätsschule, Rahmenlehrplan)';
  if (level === 'Berufsschule') return 'Berufsfachschule';
  if (level === 'Erwachsene') return 'Erwachsenenbildung';
  return level || 'Volksschule (Lehrplan 21)';
}

const topicSchema = z
  .object({
    images: z
      .array(z.string().max(MAX_IMAGE_CHARS, 'Ein Foto ist zu gross.').regex(IMAGE, 'Ungültiges Bild.'))
      .max(LIMITS.learnPhotos, `Höchstens ${LIMITS.learnPhotos} Fotos auf einmal.`)
      .default([]),
    text: z.string().max(LIMITS.topicNotes, 'Die Stichworte sind zu lang.').default(''),
    subject: z.string().trim().max(40).default(''),
    level: z.string().trim().max(40),
  })
  .refine((body) => body.images.length > 0 || body.text.trim().length >= 3, {
    message: 'Mach ein Foto oder schreib ein paar Stichworte zum Thema.',
  });

const TOPIC_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'subject', 'goals', 'removed_personal_data'],
  properties: {
    title: { type: 'string', description: 'Kurzer Titel des Themas, z. B. «Die Römer» oder «Brüche addieren»' },
    subject: { type: 'string', description: 'Schulfach, z. B. Geschichte, Mathematik, NMG, Französisch' },
    goals: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['text', 'content', 'uncertain'],
        properties: {
          text: { type: 'string', description: 'Lernziel als «Du kannst …»-Satz' },
          content: { type: 'string', description: 'Kernstoff zum Lernziel' },
          uncertain: { type: 'string', description: 'Leer, oder Grund, warum das Lernziel geprüft werden muss' },
        },
      },
    },
    removed_personal_data: { type: 'boolean' },
  },
} as const;

export function topicPrompt(level: string, subject: string, fromPhotos: boolean): string {
  return `Du bereitest für Kinder und Jugendliche in der Schweiz den Stoff für eine Prüfung vor.
Stufe: ${levelHint(level)}.${subject ? `\nFach: ${subject}.` : ''}

Auftrag: Formuliere die Lernziele der Prüfung und zu jedem Lernziel den Kernstoff.
- Orientiere dich am Lehrplan 21 (bzw. am Lehrplan der Schulart) und an der Stufe: Inhalt, Fachbegriffe und Sprache
  passend für dieses Alter.
- goals: 3 bis 12 Lernziele in der Reihenfolge des Stoffs, jedes als konkreter, prüfbarer Satz, der mit «Du kannst»
  beginnt (z. B. «Du kannst erklären, wie die Römische Republik regiert wurde.»).
${
  fromPhotos
    ? `- Auf den Fotos stehen Lernziele, Buchseiten, Arbeitsblätter oder Notizen. Stehen Lernziele drauf, übernimm sie
  sinngemäss. Der Kernstoff stammt aus den Fotos; ergänze nur, was direkt zum Verständnis dazugehört.`
    : '- Grundlage sind die Stichworte. Nimm gesichertes Schulwissen für diese Stufe – nichts Strittiges, nichts Erfundenes.'
}
- content: der Kernstoff zum Lernziel in 2 bis 6 kurzen Sätzen oder Stichworten – Fakten, Begriffe mit Erklärung,
  Regeln, Formeln, Jahreszahlen, typische Beispiele –, so dass sich daraus Prüfungsfragen stellen lassen.
- uncertain: leer, ausser du konntest etwas nicht sicher lesen oder bist fachlich unsicher – dann kurz den Grund.
- title: kurz und konkret (höchstens 60 Zeichen). subject: das Schulfach.
- Schreibe in Schweizer Rechtschreibung (ss statt ß). Fremdsprachige Wörter exakt mit allen Akzenten.
- Lass Namen von Personen, Noten, Unterschriften und Klassen weg und setze dann removed_personal_data auf true.
- Ist kein Lernstoff zu erkennen, gib eine leere Liste goals zurück.
Antworte ausschliesslich mit JSON nach dem Schema.`;
}

/** The model's answer as a clean draft – anything broken is dropped. */
export function toTopicDraft(raw: unknown, level: string, subject: string): TopicDraft {
  const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const goals: TopicDraft['goals'] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(data.goals) ? data.goals : []) {
    if (!item || typeof item !== 'object') continue;
    const goal = item as Record<string, unknown>;
    const goalText = text(goal.text, LIMITS.goalText);
    if (!goalText || seen.has(goalText.toLowerCase())) continue;
    seen.add(goalText.toLowerCase());
    goals.push({
      text: goalText,
      content: typeof goal.content === 'string' ? goal.content.trim().slice(0, LIMITS.goalContent) : '',
      uncertain: text(goal.uncertain, 200),
    });
    if (goals.length >= LIMITS.goalsPerTopic) break;
  }
  return {
    title: text(data.title, LIMITS.stackTitleMax) || 'Neues Thema',
    subject: text(data.subject, 40) || subject,
    level,
    goals,
    removedPersonalData: data.removed_personal_data === true,
  };
}

async function draftTopic(
  config: LearnConfig,
  input: { images: string[]; text: string; subject: string; level: string },
  log: FastifyBaseLogger,
): Promise<unknown> {
  const fromPhotos = input.images.length > 0;
  const notes = input.text.trim();
  return chat(
    config,
    {
      messages: [
        { role: 'system', content: topicPrompt(input.level, input.subject, fromPhotos) },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: [
                fromPhotos ? `Hier sind ${input.images.length} Foto(s) der Unterlagen.` : '',
                notes ? `Stichworte zum Thema:\n${notes}` : '',
                'Erstelle die Lernziele mit dem Kernstoff.',
              ]
                .filter(Boolean)
                .join('\n\n'),
            },
            ...input.images.map((image) => ({ type: 'image_url', image_url: { url: image } })),
          ],
        },
      ],
      response_format: { type: 'json_schema', json_schema: { name: 'lernthema', strict: true, schema: TOPIC_SCHEMA } },
      reasoning_effort: 'none',
      temperature: 0.2,
      max_tokens: 6000,
    },
    'topic',
    log,
  );
}

export const taskRoutes: FastifyPluginAsync<{ rateLimit: boolean; learn: LearnConfig | null }> = async (app, opts) => {
  const limit = (max: number) => ({
    rateLimit: opts.rateLimit ? { max, timeWindow: '15 minutes' } : (false as const),
  });
  const running = new Set<string>();

  /** A topic from photos and/or keywords: the AI suggests the learning goals, the person checks them. */
  app.post(
    '/topic',
    { preHandler: app.requireAccess, config: limit(20), bodyLimit: 16 * 1024 * 1024 },
    async (request): Promise<TopicDraftResponse> => {
      const learn = opts.learn;
      if (!learn) throw new HttpError(503, 'learn_unavailable', 'Die KI-Auswertung ist auf diesem Server nicht eingerichtet.');
      const userId = request.user!.id;
      const body = topicSchema.parse(request.body);
      if (!body.images.every(looksLikeImage)) throw new HttpError(400, 'invalid_image', 'Mindestens ein Foto ist kein gültiges Bild.');
      assertAnalysisLeft(app.db, learn, userId);
      if (running.has(userId)) throw new HttpError(429, 'learn_running', 'Eine Auswertung läuft bereits.');

      running.add(userId);
      try {
        let draft: TopicDraft | null = null;
        for (let attempt = 0; attempt < 2 && !draft; attempt++) {
          try {
            draft = toTopicDraft(await draftTopic(learn, body, request.log), body.level, body.subject);
          } catch (error) {
            if (!(error instanceof UpstreamError)) throw error;
            if (attempt === 1) throw new HttpError(502, 'learn_failed', 'Die Auswertung hat leider nicht geklappt. Versuch es nochmals.');
          }
        }
        if (!draft || draft.goals.length === 0) {
          throw new HttpError(
            422,
            'learn_empty',
            body.images.length > 0
              ? 'Auf den Fotos habe ich keinen Lernstoff gefunden. Versuch es mit schärferen Fotos oder mit Stichworten.'
              : 'Zu diesen Stichworten habe ich keine Lernziele gefunden. Beschreib das Thema etwas genauer.',
          );
        }
        countLearnUsage(app.db, userId, currentMonth());
        return { draft, usage: learnUsage(app.db, learn, userId) };
      } finally {
        running.delete(userId);
      }
    },
  );
};
