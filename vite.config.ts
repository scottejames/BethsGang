import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // Silent background update — no "new version available, reload?" prompt to
      // decide on. Matches this app's own low-friction, low-decision-fatigue design
      // (designs/design-principles.md): a service worker takes over on the *next*
      // visit automatically, never interrupting the current session.
      registerType: 'autoUpdate',
      manifest: {
        name: "Beth's Gang",
        short_name: "Beth's Gang",
        description: 'A small toolbox for getting unstuck.',
        // Matches --accent/--bg (light theme) in src/index.css, and the existing
        // <meta name="theme-color"> in index.html — the installed app's title bar/
        // splash screen use the same colors the in-browser app already does.
        theme_color: '#1f7a8c',
        background_color: '#faf9f7',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          // A maskable icon needs its content padded to an inner ~80% "safe zone" —
          // see the generation comment in the script that produced this file — so an
          // OS home screen can crop it to a circle/squircle without clipping the logo.
          { src: '/pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Default globPatterns already precache the built JS/CSS/HTML/icons — the
        // "app shell" that makes reopening the installed app instant and lets every
        // client-side, localStorage-backed tool (Pomodoro, Distract Me, Remind Me,
        // Timetable, Dopamine Menu, Essay Phrase Bank) keep working with no network
        // at all. AI-backed tools and signed-in sync still need the AppSync/Lambda
        // backend and are deliberately NOT precached or faked offline — they already
        // have a real error state (useAiTool's catch block) for "the network call
        // failed," which is the correct behavior when genuinely offline too.
        //
        // Distract Me's ambient audio (public/audio/*.mp3, ~7.8MB total) is
        // runtime-cached instead of precached: precaching would make every fresh
        // install download all four tracks up front before the app is even usable.
        // CacheFirst means each track is fetched once (first play) and reused
        // offline after that — cached at all only if actually played, staying
        // cheap for the common case of using just one or two sounds.
        runtimeCaching: [
          {
            urlPattern: /\/audio\/.*\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'distract-me-audio',
              expiration: {
                maxEntries: 8, // generous headroom over the current 5 tracks
                maxAgeSeconds: 60 * 60 * 24 * 90, // 90 days — these files don't change
              },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
  },
})
