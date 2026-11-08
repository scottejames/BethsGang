import { defineConfig } from 'vitest/config';

// Separate from vite.config.ts so live checks never run in `npm test` or during a deploy.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['live/**/*.live.ts'],
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
