import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    testTimeout: 15000,
    setupFiles: ['src/test/capacitor-app.mock.ts'],
    // Cada spec con su propio registro de módulos: con isolate:false, 3 specs
    // importan @capacitor/app real + 3 specs lo mockeaban → binding dependiente
    // del orden de chunks (flake "doble gatillo"). isolate:true lo hace
    // determinista (medido 14/14) a costa de una suite más lenta.
    isolate: true,
  },
});
