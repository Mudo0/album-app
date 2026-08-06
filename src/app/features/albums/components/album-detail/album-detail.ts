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
import { AlbumService } from '../../services/album.service';

import { BackButton } from '../../../../shared/components/back-button/back-button';
import { ImageService } from '../../../images/services/image.service';
import { StickerImage } from '../../../../core/models/stickerImage.viewModel';



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

  ngOnInit(): void {
    this.loadData();

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadImages());
  }

  onDragStarted(sticker: StickerImage): void {
    // Mover al final del array: sin z-index, el apilamiento lo define el
    // orden del DOM (último hermano = arriba), y @for lo mantiene sync con el array
    this.stickers.update((current) => {
      const rest = current.filter((s) => s.id !== sticker.id);
      return [...rest, sticker];
    });
  }

  onDragEnded(sticker: StickerImage, event: CdkDragEnd): void {
    const { x, y } = event.source.getFreeDragPosition();
    // Actualización inmutable: nueva referencia => el signal notifica el CD
    this.stickers.update((current) =>
      current.map((s) => (s.id === sticker.id ? { ...s, x, y } : s)),
    );
    // El orden del array ES el z-order: persistir la secuencia completa
    // (índice → order) para que el apilamiento sobreviva a la recarga.
    // Reasignar todos evita órdenes duplicados => sortBy estable
    this.imageService.updatePosition(sticker.id, x, y);
    this.imageService.updateOrder(
      this.stickers().map((s, i) => ({ id: s.id, order: i })),
    );
  }

  async deleteImage(imageId: string, event: Event): Promise<void> {
    event.stopPropagation();
    event.preventDefault();
    if (!confirm('¿Eliminar esta imagen?')) return;

    await this.imageService.remove(imageId);
    await this.loadImages(); // recrea stickers y revoca las URLs viejas (incluida la eliminada)
  }

  ngOnDestroy(): void {
    for (const sticker of this.stickers()) {
      URL.revokeObjectURL(sticker.objectUrl);
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

    const images = await this.imageService.getByAlbum(album.id);
    const stickers: StickerImage[] = images.map((img, i) => ({
      ...img,
      x: img.x ?? 20 + ((i * 55) % 240),
      y: img.y ?? 20 + ((i * 35) % 560),
      objectUrl: URL.createObjectURL(new Blob([img.data], { type: img.mimeType })),
    }));

    // Revocar las viejas recién acá: durante el await los stickers visibles
    // siguen con sus URLs válidas
    for (const sticker of this.stickers()) {
      URL.revokeObjectURL(sticker.objectUrl);
    }

    this.stickers.set(stickers);
  }
}
