import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', redirectTo: '/albums', pathMatch: 'full' },
  {
    path: 'albums',
    children: [
      {
        path: '',
        loadComponent: () =>
          import('./features/albums/album-list/album-list').then(
            (m) => m.AlbumList,
          ),
      },
      {
        path: 'new',
        loadComponent: () =>
          import('./features/albums/album-form/album-form').then(
            (m) => m.AlbumForm,
          ),
      },
      {
        path: ':id',
        loadComponent: () =>
          import('./features/albums/album-detail/album-detail').then(
            (m) => m.AlbumDetail,
          ),
      },
      {
        path: ':albumId/view/:imageId',
        loadComponent: () =>
          import('./features/images/image-viewer/image-viewer').then(
            (m) => m.ImageViewer,
          ),
      },
      { path: '**', redirectTo: '/albums' },
    ],
  },
  { path: '**', redirectTo: '/albums' },
];
