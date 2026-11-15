/**
 * Renders the PWA icons from client/public/favicon.svg with the pre-installed
 * Chromium (Playwright). Run: npm run icons
 */
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

// Playwright is not a project dependency; resolve the globally installed copy.
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const svg = readFileSync(new URL('../client/public/favicon.svg', import.meta.url), 'utf8');
const out = (name) => new URL(`../client/public/${name}`, import.meta.url).pathname;

const targets = [
  { file: 'icons/icon-192.png', size: 192, padding: 0, radius: true },
  { file: 'icons/icon-512.png', size: 512, padding: 0, radius: true },
  // Maskable icons need a safe zone: the artwork is scaled down on a full-bleed background.
  { file: 'icons/icon-maskable-512.png', size: 512, padding: 0.12, radius: false },
  { file: 'apple-touch-icon.png', size: 180, padding: 0, radius: false },
];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
for (const t of targets) {
  const inner = Math.round(t.size * (1 - t.padding * 2));
  // Full-bleed variants: drop the rounded background and the ring, the page background shows instead.
  const art = t.radius ? svg : svg.replace(/<rect width="512"[^>]*\/>/, '').replace(/<circle cx="400"[^>]*\/>/, '');
  await page.setViewportSize({ width: t.size, height: t.size });
  await page.setContent(`<!doctype html><html><body style="margin:0;display:grid;place-items:center;width:${t.size}px;height:${t.size}px;background:${t.radius ? 'transparent' : 'linear-gradient(135deg,#ff3d8b,#ff8a3d)'}">
    <div style="width:${inner}px;height:${inner}px">${art.replace('<svg ', '<svg width="100%" height="100%" ')}</div></body></html>`);
  await page.screenshot({ path: out(t.file), omitBackground: t.radius });
  console.log('wrote', t.file);
}
await browser.close();
