import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves the app from /<repo-name>/. Override with VITE_BASE if the repo is named differently.
const base = process.env.VITE_BASE ?? '/WalletZen/';

export default defineConfig({
  base,
  // Own port so it never collides with other local Vite apps on the default 5173.
  server: { port: 5180, strictPort: true, open: true },
  preview: { port: 4180, strictPort: true },
  build: {
    chunkSizeWarningLimit: 700, // the Firebase SDK alone is ~630 kB
    rolldownOptions: {
      output: {
        // Long-lived vendor chunks cache independently of app code between deploys.
        codeSplitting: {
          groups: [
            { name: 'firebase', test: /node_modules[\\/]@?firebase/ },
            { name: 'charts', test: /node_modules[\\/](recharts|d3-|victory-vendor|@reduxjs|immer|reselect)/ },
            { name: 'react', test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ },
          ],
        },
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'favicon-*.png', 'apple-touch-icon-180x180.png', 'brand/*.png'],
      manifest: {
        name: 'WalletZen',
        short_name: 'WalletZen',
        description: 'Personal cashbook for accounts, bills and committees.',
        theme_color: '#0A1A12',
        background_color: '#FFFFFF',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'pwa-64x64.png', sizes: '64x64', type: 'image/png' },
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'maskable-icon-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
      },
    }),
  ],
});
