// core/tokens/album-repository.token.ts
import { InjectionToken } from '@angular/core';
import { AlbumRepository } from '../interfaces/repositories/album.repository';

export const ALBUM_REPOSITORY = new InjectionToken<AlbumRepository>('ALBUM_REPOSITORY');
