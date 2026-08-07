import { FactoryProvider, inject } from '@angular/core';
import { IMAGE_REPOSITORY } from '../tokens/image-repository.token';
import { LocalImageRepository } from '../repositories/images/local-image.repository';

export const imageRepositoryProvider: FactoryProvider = {
  provide: IMAGE_REPOSITORY,
  useFactory: () => {
    const localRepo = inject(LocalImageRepository);

   // PARA DESPUES
    //if (premium) = inject(RemoteImageRepository);

    return localRepo;
  },
};
