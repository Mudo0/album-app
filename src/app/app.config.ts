import type { ApplicationConfig } from '@angular/core';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { albumRepositoryProvider } from './core/providers/album-repository.provider';
import { imageRepositoryProvider } from './core/providers/image-repository.provider';
import { DevSeederService } from './core/dev/dev-seeder.service';
import { UpdateCheckerService } from './core/services/updates/update-checker.service';

export const appConfig: ApplicationConfig = {
  providers: [
    albumRepositoryProvider,
    imageRepositoryProvider,
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // Dev-only: siembra un álbum de prueba en desktop (no-op en prod/device)
    provideAppInitializer(() => inject(DevSeederService).seedOnceForDev()),
    // Auto-check de actualizaciones fire-and-forget (D9). init() no-op en
    // web/desktop/tests; en Android dispara check + resumePending + listeners.
    provideAppInitializer(() => inject(UpdateCheckerService).init()),
  ],
};
