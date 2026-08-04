import {
  Component,
  inject,
  input,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  DestroyRef,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs';
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
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly imageService = inject(ImageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly id = input.required<string>();

  readonly album = signal<Album | undefined>(undefined);
  readonly images = signal<Image[]>([]);
  readonly loading = signal(true);

  private readonly urls = new Map<string, string>();

  ngOnInit(): void {
    this.loadData();

    // Recargar imágenes al volver del uploader (misma ruta, componente ya instanciado)
    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadImages());
  }

  imageUrl(image: Image): string {
    if (!this.urls.has(image.id)) {
      const blob = new Blob([image.data], { type: image.mimeType });
      this.urls.set(image.id, URL.createObjectURL(blob));
    }
    return this.urls.get(image.id)!;
  }

  ngOnDestroy(): void {
    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
  }

  private async loadData(): Promise<void> {
    this.loading.set(true);
    const album = await this.albumService.getById(this.id());
    this.album.set(album);
    await this.loadImages();
    this.loading.set(false);
  }

  private async loadImages(): Promise<void> {
    const album = this.album();
    if (!album) return;

    // Limpiar URLs viejas
    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();

    const images = await this.imageService.getByAlbum(album.id);
    this.images.set(images);
  }
}
