import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    pool: 'threads',
    globals: true,
    environment: 'jsdom',
    testTimeout: 15000,
  },
});
