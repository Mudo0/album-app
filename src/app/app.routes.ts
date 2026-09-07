import type { Routes } from '@angular/router';
import { ensureGalleryPermission } from './core/guards/gallery-permission.guard';

export const routes: Routes = [
  { path: '', redirectTo: '/albums', pathMatch: 'full' },
  {
    path: 'albums',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/albums/components/album-list/album-list').then((m) => m.AlbumList),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/albums/components/album-form/album-form').then((m) => m.AlbumForm),
        data: { backTo: '/albums' },
      },
      {
        path: ':id/upload',
        loadComponent: () =>
          import('./features/images/components/image-uploader/image-uploader').then(
            (m) => m.ImageUploader,
          ),
        data: { backTo: '/albums/:id' },
      },
      {
        path: ':id/edit',
        loadComponent: () =>
          import('./features/albums/components/album-form/album-form').then((m) => m.AlbumForm),
        data: { backTo: '/albums' },
      },
      {
        path: ':albumId/view/:imageId',
        loadComponent: () =>
          import('./features/images/components/image-viewer/image-viewer').then(
            (m) => m.ImageViewer,
          ),
        data: { backTo: '/albums/:albumId' },
      },
      {
        // Fix 1: pantalla de permisos dedicada — destino del guard de ':id'.
        // Declarada ANTES de ':id' (segmento estático > paramétrico) y FUERA
        // de la jerarquía ':id/...' para que el guard no se recuse a sí mismo.
        path: 'permissions/:albumId',
        loadComponent: () =>
          import('./features/images/components/permission-required/permission-required').then(
            (m) => m.PermissionRequired,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/albums/components/album-detail/album-detail').then(
            (m) => m.AlbumDetail,
          ),
        canActivate: [ensureGalleryPermission],
        data: { backTo: '/albums' },
      },
      { path: '**', redirectTo: '/albums' },
    ],
  },
  { path: '**', redirectTo: '/albums' },
];
