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
import { DragDropModule } from '@angular/cdk/drag-drop';
import type { CdkDragEnd, CdkDragStart } from '@angular/cdk/drag-drop';
import { filter } from 'rxjs';
import type { Album } from '../../../../core/models/album.model';
import type { Image } from '../../../../core/models/image.model';
import { AlbumService } from '../../services/album.service';

import { BackButton } from '../../../../shared/components/back-button/back-button';
import { ImageService } from '../../../images/services/image.service';

interface StickerImage extends Image {
  x: number;
  y: number;
  z: number;
}

@Component({
  selector: 'app-album-detail',
  standalone: true,
  imports: [RouterLink, BackButton, DragDropModule],
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
  readonly stickers = signal<StickerImage[]>([]);
  readonly loading = signal(true);

  private readonly urls = new Map<string, string>();

  ngOnInit(): void {
    this.loadData();

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadImages());
  }

  stickerUrl(sticker: StickerImage): string {
    if (!this.urls.has(sticker.id)) {
      const blob = new Blob([sticker.data], { type: sticker.mimeType });
      this.urls.set(sticker.id, URL.createObjectURL(blob));
    }
    return this.urls.get(sticker.id)!;
  }

  onDragStarted(sticker: StickerImage): void {
    // Mover al final del array para que quede último en el DOM
    // y darle el z-index máximo (= cantidad de stickers)
    this.stickers.update((current) => {
      const rest = current.filter((s) => s.id !== sticker.id);
      return [...rest, sticker];
    });
    sticker.z = this.stickers().length;
  }

  onDragEnded(sticker: StickerImage, event: CdkDragEnd): void {
    const { x, y } = event.source.getFreeDragPosition();
    sticker.x = x;
    sticker.y = y;
    this.imageService.updatePosition(sticker.id, x, y);
  }

  async deleteImage(imageId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm('¿Eliminar esta imagen?')) return;

    const url = this.urls.get(imageId);
    if (url) URL.revokeObjectURL(url);
    this.urls.delete(imageId);

    await this.imageService.remove(imageId);
    await this.loadImages();
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

    for (const url of this.urls.values()) {
      URL.revokeObjectURL(url);
    }
    this.urls.clear();

    const images = await this.imageService.getByAlbum(album.id);
    const stickers: StickerImage[] = images.map((img, i) => ({
      ...img,
      x: img.x ?? 20 + ((i * 55) % 240),
      y: img.y ?? 20 + ((i * 35) % 560),
      z: i + 1,
    }));
    this.stickers.set(stickers);
  }
}
