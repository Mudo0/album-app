// core/providers/album-repository.provider.ts
import { FactoryProvider, inject } from '@angular/core';
import { ALBUM_REPOSITORY } from '../tokens/album-repository.token';
import { LocalAlbumRepository } from '../repositories/albums/local-album.repository';

// import { RemoteAlbumRepository } from '../repositories/remote-album.repository';
// import { AuthService } from '../services/auth.service';

export const albumRepositoryProvider: FactoryProvider = {
  provide: ALBUM_REPOSITORY,
  useFactory: () => {
    const localRepo = inject(LocalAlbumRepository);

    // === PATRÓN STRATEGY ===
    // Evaluamos el estado del usuario en tiempo de ejecución.
    // Dependiendo del resultado, retornamos la clase concreta adecuada.

    // Estrategia A: HTTP / Backend
    // Estrategia B: IndexedDB / Local

    // Lógica futura para el Strategy:
    // const remoteRepo = inject(RemoteAlbumRepository);
    // const isPremium = inject(AuthService).isPremiumUser();
    // return isPremium ? remoteRepo : localRepo;

    return localRepo;
  },
};
