import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/step-up/',
  build: { outDir: 'dist' },
  plugins: [
    VitePWA({
      // injectManifest (a hand-written service worker) instead of the
      // default generateSW, so we can add push/notificationclick handlers
      // for the 7:30 alarm + nudge — see src/sw.js.
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['icons/icon-192.png', 'icons/icon-512.png'],
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
      manifest: {
        name: 'Step Up',
        short_name: 'Step Up',
        description: 'Voice-guided daily workout routine tracker',
        theme_color: '#1b1f27',
        background_color: '#1b1f27',
        display: 'standalone',
        start_url: '/step-up/',
        scope: '/step-up/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
    }),
  ],
});
