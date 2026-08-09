/// <reference types="vitest" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        // Dictionary shards are fetched on demand and cached at runtime.
        runtimeCaching: [
          {
            urlPattern: /\/dict\/.*\.json$/,
            handler: 'CacheFirst',
            // Bump this name whenever the shard payload SHAPE changes (e.g.
            // meanings: string[] -> { en?, fr? }). Workbox does not clear
            // runtime caches on SW update, and with exactly 128 shards the
            // maxEntries LRU cap never evicts, so a name bump is the only way
            // to retire stale bodies from this cache layer. See lookup.ts's
            // loadShard for the read-side hedge that covers the rest.
            options: { cacheName: 'chinanki-dict-v2', expiration: { maxEntries: 128 } },
          },
        ],
      },
      manifest: {
        name: 'Chinanki',
        short_name: 'Chinanki',
        description: 'Mandarin vocabulary spaced repetition',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', './e2e/**'],
  },
});
