import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

export default defineConfig({
  root: 'client',
  publicDir: 'public',
  define: {
    __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? pkg.version),
  },
  build: {
    outDir: '../dist/client',
    emptyOutDir: true,
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  server: {
    host: true,
    port: 5173,
    proxy: {
      '/api': 'http://127.0.0.1:3000',
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['icons/phoni.svg', 'icons/phoni-180.png'],
      manifest: {
        id: '/',
        name: 'Phonegames – Partyspiele',
        short_name: 'Phonegames',
        description: 'Ein Handy. Die ganze Runde. 17 Partyspiele und Lernen – auch offline.',
        lang: 'de-CH',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#fff6e9',
        theme_color: '#fff6e9',
        categories: ['games', 'entertainment'],
        icons: [
          { src: '/icons/phoni-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/phoni-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/phoni-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
      },
    }),
  ],
});
