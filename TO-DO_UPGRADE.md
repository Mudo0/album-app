---

## title: "Arquitectura Híbrida: Patrón Strategy + Repositorio"
date: "2026-08-06"
type: "Architecture"

Para preparar tu aplicación para ese *upgrade* futuro sin tener que reescribir todo el código, debes implementar el **Patrón Repositorio** combinado con el **Patrón Strategy**, apoyándote en el sistema de Inyección de Dependencias (DI) de Angular.

La estructura exacta, análoga a cómo registrarías interfaces en el contenedor de dependencias de C# o Java, se divide en estos tres pasos:

### 1. Definir el Contrato (Interfaz)

Creas una interfaz estricta que define qué operaciones se pueden hacer con las imágenes, independientemente de dónde se guarden. Tus componentes (como `AlbumDetail`) solo conocerán esta interfaz, nunca la implementación real.

```typescript
// core/interfaces/image-repository.interface.ts
import type { Image } from '../models/image.model';

export interface IImageRepository {
  save(image: Image, originalBlob: Blob, thumbnailBlob: Blob): Promise<void>;
  getByAlbum(albumId: string): Promise<Image[]>;
  remove(id: string): Promise<void>;
  updatePosition(id: string, x: number, y: number, z: number): Promise<void>;
}

```

### 2. Crear las dos Estrategias (Implementaciones)

Desarrollas tu versión offline ahora, y dejas la estructura lista para la versión online.

**A. La estrategia actual (Tier Gratuito):**

```typescript
// data/repositories/local-image.repository.ts
import { Injectable } from '@angular/core';
import type { IImageRepository } from '../../core/interfaces/image-repository.interface';

@Injectable({ providedIn: 'root' })
export class LocalImageRepository implements IImageRepository {
  // Inyectas tu servicio de IndexedDB aquí
  
  async save(image: Image, originalBlob: Blob, thumbnailBlob: Blob): Promise<void> {
    // 1. Guardar metadatos en store de "images"
    // 2. Guardar Blobs en store de "files"
  }
  // ... resto de implementaciones
}

```

**B. La estrategia futura (Tier Premium):**

```typescript
// data/repositories/remote-image.repository.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { IImageRepository } from '../../core/interfaces/image-repository.interface';

@Injectable({ providedIn: 'root' })
export class RemoteImageRepository implements IImageRepository {
  private readonly http = inject(HttpClient);

  async save(image: Image, originalBlob: Blob, thumbnailBlob: Blob): Promise<void> {
    // 1. Pedir Pre-signed URL al backend
    // 2. Subir Blob al Cloud Storage
    // 3. POST al backend con los metadatos y la URL resultante
  }
  // ... resto de implementaciones HTTP
}

```

### 3. Resolver dinámicamente en el Inyector (Factory Provider)

En Angular, configuras un *InjectionToken* y una función de fábrica. Esta fábrica revisa el estado del usuario (ej. si está registrado/pagó) y decide qué repositorio instanciar y entregarle al resto de la aplicación.

```typescript
// core/providers/image-repository.provider.ts
import { InjectionToken } from '@angular/core';
import { LocalImageRepository } from '../../data/repositories/local-image.repository';
import { RemoteImageRepository } from '../../data/repositories/remote-image.repository';
import { AuthService } from '../services/auth.service'; // Tu servicio que maneja el estado del usuario

export const IMAGE_REPOSITORY = new InjectionToken<IImageRepository>('ImageRepository');

export const imageRepositoryProvider = {
  provide: IMAGE_REPOSITORY,
  useFactory: (
    authService: AuthService, 
    localRepo: LocalImageRepository, 
    remoteRepo: RemoteImageRepository
  ) => {
    return authService.isPremiumUser() ? remoteRepo : localRepo;
  },
  deps: [AuthService, LocalImageRepository, RemoteImageRepository]
};

```

### 4. Uso en tu Componente

Modificas tu componente actual para que inyecte el token en lugar de un servicio concreto.

```typescript
// features/album/album-detail.ts
import { Component, inject } from '@angular/core';
import { IMAGE_REPOSITORY } from '../../../core/providers/image-repository.provider';

export class AlbumDetail {
  // El componente no sabe si está usando IndexedDB o tu Backend HTTP.
  // Funciona igual para ambos casos.
  private readonly imageRepo = inject(IMAGE_REPOSITORY);

  async loadImages(): Promise<void> {
    const images = await this.imageRepo.getByAlbum(this.id());
    // ... lógica de UI
  }
}

```

### El proceso de "Upgrade" (Migración)

Cuando el usuario gratuito paga la suscripción, debes ejecutar un proceso de migración de una sola vez antes de cambiar la bandera `isPremiumUser()` a `true`:

1. Lees todos los registros de `LocalImageRepository` (IndexedDB).
2. Iteras y envías cada uno usando los métodos de `RemoteImageRepository` (subida a Cloud + Backend).
3. Una vez confirmado que el backend guardó todo, limpias IndexedDB.
4. Cambias el estado del usuario. A partir de ese momento, la inyección de dependencias de Angular empezará a usar la clase remota automáticamente en toda tu PWA.
