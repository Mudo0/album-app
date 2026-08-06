import type { Routes } from '@angular/router';

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
        path: ':id',
        loadComponent: () =>
          import('./features/albums/album-detail/album-detail').then((m) => m.AlbumDetail),
        data: { backTo: '/albums' },
      },
      { path: '**', redirectTo: '/albums' },
    ],
  },
  { path: '**', redirectTo: '/albums' },
];
