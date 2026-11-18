/*
 * Server for the browser tests: the real app (built client from dist/client) with an
 * in-memory database, no rate limits and stand-ins for the AI service and Stripe, so the
 * tests never call Infomaniak or Stripe and always get the same cards and payments.
 *
 *   npm run build && node e2e/server.ts      (Playwright starts it itself, see playwright.config.ts)
 */
import http from 'node:http';
import path from 'node:path';
import { buildApp } from '../server/src/app.ts';
import { PRICE_PER_YEAR, TRIAL_DAYS } from '../server/src/billing.ts';
import { openDatabase } from '../server/src/db.ts';
import { FAKE_STRIPE_KEY, startFakeStripe } from '../server/test/fakeStripe.ts';

const PORT = Number(process.env.E2E_PORT ?? 3100);
const AI_PORT = PORT + 1;

const card = (prompt: string, answer: string, distractors: string[], kind = 'translation') => ({
  kind,
  prompt,
  answer,
  accepted: [],
  distractors,
  uncertain: '',
});

/** What the AI «reads» from any photo. */
const EXACT = {
  title: 'Unité 5 – Vocabulaire',
  subject: 'Französisch',
  languages: ['fr', 'de'],
  cards: [
    card('le chien', 'der Hund', ['die Katze', 'das Haus', 'der Vogel']),
    card('la maison', 'das Haus', ['der Garten', 'die Schule', 'das Auto']),
    card('l’école', 'die Schule', ['das Haus', 'der Hund', 'die Stadt']),
    { ...card('toujours', 'immer', ['nie', 'oft', 'heute']), uncertain: 'Schrift unklar' },
  ],
  suggested_modes: ['kasten', 'duell'],
  removed_personal_data: true,
};

/** What the AI «invents» on the same topic. */
const CREATIVE = {
  ...EXACT,
  title: 'Unité 5 – Übung',
  cards: [
    card('le chat', 'die Katze', ['der Hund', 'die Maus', 'das Pferd']),
    card('le jardin', 'der Hund', ['der Garten', 'die Wiese', 'das Feld']),
    card('la ville', 'die Stadt', ['das Dorf', 'die Strasse', 'das Land']),
  ],
  removed_personal_data: false,
};

/** The second look at invented cards finds the wrong one. */
const CHECK = { checks: [{ index: 1, correct: false, reason: '«le jardin» heisst «der Garten».' }] };

const ai = http.createServer((req, res) => {
  let body = '';
  req.on('data', (chunk) => (body += chunk));
  req.on('end', () => {
    const system = String(JSON.parse(body || '{}')?.messages?.[0]?.content ?? '');
    const answer = system.includes('kritische Lehrperson') ? CHECK : system.includes('NEUE AUFGABEN') ? CREATIVE : EXACT;
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(
      JSON.stringify({
        choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: JSON.stringify(answer) } }],
        usage: { prompt_tokens: 2000, completion_tokens: 500 },
      }),
    );
  });
});
await new Promise<void>((resolve) => ai.listen(AI_PORT, '127.0.0.1', resolve));
const stripe = await startFakeStripe(PORT + 2);

const app = await buildApp({
  db: openDatabase(':memory:'),
  rateLimit: false,
  cookieSecure: false,
  serveClient: true,
  clientDir: path.resolve('dist/client'),
  version: 'e2e',
  inviteCodes: ['PARTY-2026'],
  learn: {
    url: `http://127.0.0.1:${AI_PORT}`,
    productId: '1',
    token: 'e2e',
    model: 'fake',
    monthlyLimit: 20,
    globalMonthlyLimit: 1000,
  },
  billing: { secretKey: FAKE_STRIPE_KEY, apiUrl: stripe.url, pricePerYear: PRICE_PER_YEAR, trialDays: TRIAL_DAYS },
});
await app.listen({ port: PORT, host: '127.0.0.1' });

const stop = async () => {
  await app.close();
  ai.close();
  await stripe.close();
  process.exit(0);
};
process.on('SIGTERM', () => void stop());
process.on('SIGINT', () => void stop());
