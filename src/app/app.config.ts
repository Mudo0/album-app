import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { albumRepositoryProvider } from './core/providers/album-repository.provider';
import { HttpClient } from '@angular/common/http';

export const appConfig: ApplicationConfig = {
  providers: [
    albumRepositoryProvider,
    HttpClient,
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
  ],
};
