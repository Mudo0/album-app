import {
  Component,
  ElementRef,
  inject,
  input,
  signal,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
  DestroyRef,
  Renderer2,
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
import { LongPressDirective, LongPressPosition } from '../../../../shared/directives/long-press';



@Component({
  selector: 'app-album-detail',
  standalone: true,
  imports: [RouterLink, BackButton, DragDropModule, LongPressDirective],
  templateUrl: './album-detail.html',
  styleUrl: './album-detail.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AlbumDetail implements OnInit, OnDestroy {
  private readonly albumService = inject(AlbumService);
  private readonly imageService = inject(ImageService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly renderer = inject(Renderer2);
  private readonly hostEl = inject(ElementRef<HTMLElement>);

  /** Listener global para cerrar el menú al tocar fuera. */
  private documentClickUnlisten: (() => void) | null = null;

  /** Contador para z-index ascendente al hacer drag. */
  private maxZIndex = 0;

  readonly id = input.required<string>();

  readonly album = signal<Album | undefined>(undefined);
  readonly stickers = signal<StickerImage[]>([]);
  readonly loading = signal(true);
  readonly toast = signal<string | null>(null);
  /** Plain variable (NOT signal) — writing a signal during drag triggers CD,
   *  which re-evaluates cdkDragFreeDragPosition bindings mid-drag. */
  isDragging = false;

  // ── Context menu state ──
  readonly menuVisible = signal(false);
  readonly menuSticker = signal<StickerImage | null>(null);
  readonly menuPosition = signal<{ x: number; y: number }>({ x: 0, y: 0 });

  ngOnInit(): void {
    this.loadData();

    this.router.events
      .pipe(
        filter((e) => e instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(() => this.loadImages());
  }

  /**
   * Drag iniciado: solo setea z-index vía Renderer2 (sin signals = sin CD).
   * NO reordena el array stickers() acá, porque triggers CD durante drag
   * y CDK's setFreeDragPosition() resetea _activeTransform a {0,0}.
   */
  onDragStarted(sticker: StickerImage, event: CdkDragStart): void {
    this.isDragging = true;
    this.maxZIndex++;
    this.renderer.setStyle(
      event.source.element.nativeElement,
      'z-index',
      this.maxZIndex,
    );
  }

  /**
   * Drag finalizado: usa event.distance (delta REAL del mouse) en vez de
   * getFreeDragPosition(), porque para micro-drags CDK retorna {0,0}.
   *
   * _activeTransform se inicializa en {0,0} por setFreeDragPosition().
   * Solo se computa correctamente en _pointerMove línea 928+.
   * Para micro-drags, el _pointerMove que arranca el drag retorna en
   * línea 915 SIN calcular el transform, y _pointerUp viene después.
   * Resultado: _activeTransform queda en {0,0} y getFreeDragPosition()
   * retorna {0,0}.
   */
  onDragEnded(sticker: StickerImage, event: CdkDragEnd): void {
    this.isDragging = false;

    const { x: dx, y: dy } = event.distance;
    const x = sticker.x + dx;
    const y = sticker.y + dy;

    this.stickers.update((current) =>
      current.map((s) => (s.id === sticker.id ? { ...s, x, y } : s)),
    );
    this.imageService.updatePosition(sticker.id, { x, y });
    this.imageService.updateOrder(
      this.stickers().map((s, i) => ({ id: s.id, order: i })),
    );
  }

  async deleteImage(imageId: string): Promise<void> {
    if (!confirm('¿Eliminar esta imagen?')) return;

    await this.imageService.remove(imageId);
    await this.loadImages();
  }

  // ── Context menu ──

  openContextMenu(sticker: StickerImage, position: LongPressPosition): void {
    this.closeContextMenu();
    this.menuSticker.set(sticker);

    // Posicionar a la derecha del toque; si no entra, a la izquierda
    const menuWidth = 48;
    const gap = 8;
    const x =
      position.x + menuWidth + gap <= window.innerWidth
        ? position.x + gap
        : position.x - menuWidth - gap;
    // Centrar verticalmente, pero sin salir de la pantalla
    const y = Math.max(0, position.y - menuWidth / 2);

    this.menuPosition.set({ x, y });
    this.menuVisible.set(true);

    // Cerrar al tocar fuera del menú
    this.documentClickUnlisten = this.renderer.listen(
      'document',
      'pointerdown',
      (event: PointerEvent) => {
        const menuEl = this.hostEl.nativeElement.querySelector('.context-menu');
        if (menuEl && !menuEl.contains(event.target as Node)) {
          this.closeContextMenu();
        }
      },
    );
  }

  closeContextMenu(): void {
    this.menuVisible.set(false);
    this.menuSticker.set(null);
    this.documentClickUnlisten?.();
    this.documentClickUnlisten = null;
  }

  async onMenuCopy(): Promise<void> {
    const sticker = this.menuSticker();
    this.closeContextMenu();
    if (!sticker) return;

    try {
      await this.imageService.copyToClipboard(sticker);
      this.showToast('Copiado al portapapeles');
    } catch {
      this.showToast('No se pudo copiar');
    }
  }

  async onMenuDelete(): Promise<void> {
    const sticker = this.menuSticker();
    this.closeContextMenu();
    if (!sticker) return;

    await this.deleteImage(sticker.id);
  }

  ngOnDestroy(): void {
    this.documentClickUnlisten?.();
    for (const sticker of this.stickers()) {
      URL.revokeObjectURL(sticker.objectUrl);
    }
  }

  private showToast(message: string): void {
    this.toast.set(message);
    setTimeout(() => this.toast.set(null), 2000);
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
      x: img.position?.x ?? 20 + ((i * 55) % 240),
      y: img.position?.y ?? 20 + ((i * 35) % 560),
      objectUrl: URL.createObjectURL(
        new Blob([img.thumbnail], { type: img.thumbnailMime }),
      ),
    }));

    // Revocar las viejas recién acá: durante el await los stickers visibles
    // siguen con sus URLs válidas
    for (const sticker of this.stickers()) {
      URL.revokeObjectURL(sticker.objectUrl);
    }

    this.stickers.set(stickers);
  }
}
