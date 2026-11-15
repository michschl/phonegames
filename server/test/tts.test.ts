import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, LightMyRequestResponse } from 'fastify';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import type { AddressInfo } from 'node:net';
import { buildApp } from '../src/app.ts';
import { openDatabase } from '../src/db.ts';

const HEADERS = { 'x-requested-with': 'phonegames' };

/** Stand-in for the Piper HTTP server: answers POST /synthesize with a tiny WAV. */
function fakePiper() {
  const calls: { text: string; voice: string }[] = [];
  let failing = false;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      if (failing || req.url !== '/synthesize') {
        res.writeHead(500).end('error');
        return;
      }
      calls.push(JSON.parse(body));
      // Slow enough that parallel requests overlap.
      setTimeout(() => res.writeHead(200, { 'Content-Type': 'text/html' }).end(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(40, 1)])), 30);
    });
  });
  return {
    calls,
    fail: () => (failing = true),
    start: () => new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

let app: FastifyInstance;
let piper: ReturnType<typeof fakePiper>;
let cacheDir: string;
let cookie: string;

function cookieFrom(res: LightMyRequestResponse): string {
  const c = res.cookies.find((x) => x.name === 'phonegames_session')!;
  return `phonegames_session=${c.value}`;
}

const say = (text: string, voice = 'thorsten', withCookie = true) =>
  app.inject({ method: 'GET', url: '/api/tts', query: { voice, text }, headers: withCookie ? { cookie } : {} });

beforeEach(async () => {
  piper = fakePiper();
  const url = await piper.start();
  cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pg-tts-'));
  app = await buildApp({ db: openDatabase(':memory:'), rateLimit: false, tts: { url, cacheDir } });
  const res = await app.inject({
    method: 'POST',
    url: '/api/auth/register',
    headers: HEADERS,
    payload: { name: 'Tom', email: 'tom@example.ch', password: 'geheim123' },
  });
  cookie = cookieFrom(res);
});

afterEach(async () => {
  await app.close();
  await piper.stop();
  fs.rmSync(cacheDir, { recursive: true, force: true });
});

describe('narrator voice (TTS)', () => {
  it('lists the voices in the auth options', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/auth/options' });
    expect(res.json().tts.voices.map((v: { id: string }) => v.id)).toEqual(['thorsten', 'kerstin']);
  });

  it('is only available when signed in', async () => {
    expect((await say('Hallo zusammen.', 'thorsten', false)).statusCode).toBe(401);
  });

  it('renders a sentence once and then serves it from the cache', async () => {
    const first = await say('Die  Nacht bricht herein. ');
    expect(first.statusCode).toBe(200);
    expect(first.headers['content-type']).toBe('audio/wav');
    expect(first.headers['cache-control']).toContain('immutable');
    expect(first.rawPayload.subarray(0, 4).toString()).toBe('RIFF');
    expect(piper.calls).toEqual([{ text: 'Die Nacht bricht herein.', voice: 'de_DE-thorsten-high' }]);

    const again = await say('Die Nacht bricht herein.');
    expect(again.statusCode).toBe(200);
    expect(piper.calls).toHaveLength(1);
    expect(fs.readdirSync(cacheDir).filter((f) => f.endsWith('.wav'))).toHaveLength(1);

    await say('Die Nacht bricht herein.', 'kerstin');
    expect(piper.calls.at(-1)).toEqual({ text: 'Die Nacht bricht herein.', voice: 'de_DE-kerstin-medium' });
  });

  it('asks the TTS service only once for parallel identical requests', async () => {
    const results = await Promise.all([say('Werwölfe, erwacht!'), say('Werwölfe, erwacht!'), say('Werwölfe, erwacht!')]);
    expect(results.map((r) => r.statusCode)).toEqual([200, 200, 200]);
    expect(piper.calls).toHaveLength(1);
  });

  it('rejects unknown voices and unsuitable text', async () => {
    expect((await say('Hallo.', 'robot')).statusCode).toBe(400);
    expect((await say('   ')).statusCode).toBe(400);
    expect((await say('x'.repeat(301))).statusCode).toBe(400);
    expect((await say('<script>alert(1)</script>')).statusCode).toBe(400);
    expect(piper.calls).toHaveLength(0);
  });

  it('answers 503 when the TTS service is down, so the app can fall back', async () => {
    piper.fail();
    const res = await say('Das Dorf erwacht.');
    expect(res.statusCode).toBe(503);
    expect(res.json().error).toBe('tts_unavailable');
  });

  it('is switched off without a TTS service', async () => {
    const off = await buildApp({ db: openDatabase(':memory:'), rateLimit: false });
    expect((await off.inject({ method: 'GET', url: '/api/auth/options' })).json().tts).toBeNull();
    await off.close();
  });
});
