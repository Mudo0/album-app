import type { ApplicationConfig } from '@angular/core';
import { inject, provideAppInitializer } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';

import { routes } from './app.routes';
import { albumRepositoryProvider } from './core/providers/album-repository.provider';
import { imageRepositoryProvider } from './core/providers/image-repository.provider';
import { DevSeederService } from './core/dev/dev-seeder.service';

export const appConfig: ApplicationConfig = {
  providers: [
    albumRepositoryProvider,
    imageRepositoryProvider,
    provideHttpClient(),
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
    // Dev-only: siembra un álbum de prueba en desktop (no-op en prod/device)
    provideAppInitializer(() => inject(DevSeederService).seedOnceForDev()),
  ],
};
