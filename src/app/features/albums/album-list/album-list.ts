import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink, Router } from '@angular/router';
import type { Album } from '../../../core/models/album.model';
import { AlbumService } from '../../../core/services/album.service';

@Component({
  selector: 'app-album-list',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './album-list.html',
  styleUrl: './album-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumList implements OnInit {
  private readonly albumService = inject(AlbumService);
  private readonly router = inject(Router);

  readonly albums = signal<Album[]>([]);
  readonly loading = signal(true);
  readonly openMenuId = signal<string | null>(null);

  ngOnInit(): void {
    this.loadAlbums();
  }

  coverColor(id: string): string {
    const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hue = hash % 360;
    return `hsl(${hue}, 50%, 82%)`;
  }

  toggleMenu(albumId: string, event: Event): void {
    event.stopPropagation();
    this.openMenuId.set(this.openMenuId() === albumId ? null : albumId);
  }

  closeMenu(): void {
    this.openMenuId.set(null);
  }

  editAlbum(albumId: string): void {
    this.closeMenu();
    this.router.navigate(['/albums', albumId, 'edit']);
  }

  async deleteAlbum(albumId: string): Promise<void> {
    this.closeMenu();
    if (!confirm('¿Eliminar este álbum y todas sus imágenes?')) return;
    await this.albumService.delete(albumId);
    await this.loadAlbums();
  }

  private async loadAlbums(): Promise<void> {
    this.loading.set(true);
    const data = await this.albumService.getAll();
    this.albums.set(data);
    this.loading.set(false);
  }
}
