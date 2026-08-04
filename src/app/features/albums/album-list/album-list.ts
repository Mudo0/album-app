import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
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

  readonly albums = signal<Album[]>([]);
  readonly loading = signal(true);

  ngOnInit(): void {
    this.albumService.getAll().then((data) => {
      this.albums.set(data);
      this.loading.set(false);
    });
  }

  /** Genera un color pastel determinista a partir del ID del álbum */
  coverColor(id: string): string {
    const hash = [...id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const hue = hash % 360;
    return `hsl(${hue}, 50%, 82%)`;
  }
}
