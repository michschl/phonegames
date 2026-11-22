/*
 * Stand-in for the Infomaniak OpenAI-compatible endpoint in the server tests: answers each call with the
 * next queued reply, or with the answer `fallback` picks for the request.
 */
import http from 'node:http';
import type { AddressInfo } from 'node:net';

export type Reply = { status?: number; content?: string };
export interface AiCall {
  url: string;
  body: Record<string, any>;
  /** The system prompt of the call. */
  system: string;
}

export function fakeAi(fallback: (call: AiCall) => unknown) {
  const calls: AiCall[] = [];
  const replies: Reply[] = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', () => {
      const body = JSON.parse(raw) as Record<string, any>;
      const call = { url: req.url!, body, system: String(body.messages?.[0]?.content ?? '') };
      calls.push(call);
      const reply = replies.shift() ?? { content: JSON.stringify(fallback(call)) };
      if (reply.status && reply.status !== 200) {
        res.writeHead(reply.status).end('{"error":"boom"}');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          choices: [{ index: 0, finish_reason: 'stop', message: { role: 'assistant', content: reply.content } }],
          usage: { prompt_tokens: 1000, completion_tokens: 500 },
        }),
      );
    });
  });
  return {
    calls,
    replies,
    start: () =>
      new Promise<string>((resolve) => server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${(server.address() as AddressInfo).port}`))),
    stop: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}
