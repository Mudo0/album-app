// core/guards/gallery-permission.guard.ts
// Guard de la ruta album-detail (albums/:id): en Android, si el permiso de
// galería no está concedido, redirige a la pantalla de permisos dedicada
// (albums/permissions/:albumId) ANTES de entrar al detail — el fix 1: el
// flujo pasa de album-list → permisos → album-detail (sin pasar por el detail
// vacío). En web (ng serve / tests) es un no-op: no hay galería nativa.
import { inject } from '@angular/core';
import type { CanActivateFn } from '@angular/router';
import { Router } from '@angular/router';
import { Capacitor } from '@capacitor/core';
import { GalleryService } from '../services/gallery.service';
import { toPermissionStatus } from '../utils/permission-status.util';

export const ensureGalleryPermission: CanActivateFn = async (route) => {
  if (!Capacitor.isNativePlatform()) return true;

  const gallery = inject(GalleryService);
  const router = inject(Router);
  const albumId = route.paramMap.get('id') ?? '';

  try {
    const perms = await gallery.checkPermissions();
    if (toPermissionStatus(perms) === 'granted') return true;
  } catch {
    // Check caído: sin estado conocido, se redirige igual — la pantalla de
    // permisos hace su propio check y decide (deep link con permiso → va al
    // detail directo).
  }

  // Permiso faltante → pantalla de permisos dedicada. El redirect NO lleva
  // query ni estado: permission-required resuelve por su cuenta.
  return router.createUrlTree(['/albums', 'permissions', albumId]);
};