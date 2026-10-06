// src/test/capacitor-app.mock.ts
// Mock ÚNICO y determinista de @capacitor/app (setup file).
//
// Por qué existe: update-checker.service, image-uploader y permission-required
// importan @capacitor/app REAL. Si cada spec registra su propio vi.mock, el
// builder (@angular/build:unit-test, isolate:false) comparte chunks con el
// módulo real y el mock se degrada por orden de evaluación → flake intermitente
// (patrón P4 de docs/chores/done/fix-tests.md: "doble gatillo" 1/2 llamadas).
// Registrado ACÁ como setup file, se aplica ANTES de evaluar cualquier spec:
// el módulo mockeado es el único que puede existir en el worker → determinista.
//
// Los specs NO importan este archivo en runtime (solo `import type`): lo leen
// vía `globalThis.__capacitorAppMock__` con un accessor local. Si un spec lo
// importara con valor, el vi.mock se re-registraría por spec y la raza volvería.
import { vi } from 'vitest';

export interface CapacitorAppMockRegistry {
  /** Callbacks de `appStateChange` (re-check al volver a primer plano). */
  appState: Array<(data: { isActive: boolean }) => void>;
  /** Callbacks de `backButton` (gesto físico de Android). */
  backButton: Array<() => void>;
  /** Handles devueltas por addListener: para probar el cleanup (remove()). */
  handles: Array<{ remove: ReturnType<typeof vi.fn> }>;
  reset(): void;
}

declare global {
  var __capacitorAppMock__: CapacitorAppMockRegistry;
}

const registry: CapacitorAppMockRegistry = {
  appState: [],
  backButton: [],
  handles: [],
  reset() {
    this.appState.length = 0;
    this.backButton.length = 0;
    this.handles.length = 0;
  },
};

globalThis.__capacitorAppMock__ = registry;

vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn((event: string, cb: unknown) => {
      const handle = { remove: vi.fn() };
      registry.handles.push(handle);
      if (event === 'appStateChange') {
        registry.appState.push(cb as (data: { isActive: boolean }) => void);
      }
      if (event === 'backButton') {
        registry.backButton.push(cb as () => void);
      }
      return Promise.resolve(handle);
    }),
  },
}));