import type { ApplicationConfig } from '@angular/core';
import { provideRouter, withComponentInputBinding, withViewTransitions } from '@angular/router';

import { routes } from './app.routes';
import { albumRepositoryProvider } from './core/providers/album-repository.provider';
import { HttpClient } from '@angular/common/http';
import { imageRepositoryProvider } from './core/providers/image-repository.provider';

export const appConfig: ApplicationConfig = {
  providers: [
    albumRepositoryProvider,
    imageRepositoryProvider,
    HttpClient,
    provideRouter(routes, withComponentInputBinding(), withViewTransitions()),
  ],
};
