import { Component, inject, input, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { Album } from '../../../core/models/album.model';
import type { Image } from '../../../core/models/image.model';
import { AlbumService } from '../../../core/services/album.service';
import { ImageService } from '../../../core/services/image.service';
import { BackButton } from '../../../shared/components/back-button/back-button';

@Component({
  selector: 'app-album-detail',
  standalone: true,
  imports: [RouterLink, BackButton],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumDetail implements OnInit {
  private readonly albumService = inject(AlbumService);
  private readonly imageService = inject(ImageService);

  readonly id = input.required<string>();

  protected readonly album = signal<Album | undefined>(undefined);
  protected readonly images = signal<Image[]>([]);
  protected readonly loading = signal(true);

  async ngOnInit(): Promise<void> {
    const album = await this.albumService.getById(this.id());
    this.album.set(album);
    if (album) {
      const images = await this.imageService.getByAlbum(album.id);
      this.images.set(images);
    }
    this.loading.set(false);
  }
}
