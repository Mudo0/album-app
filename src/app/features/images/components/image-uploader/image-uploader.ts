import {
  Component,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
  OnDestroy,
  OnInit,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';

import { NavigationService } from '../../../../core/services/navigation.service';
import { BackButton } from '../../../../shared/components/back-button/back-button';
import { GalleryError, GalleryService } from '../../../../core/services/gallery.service';
import { ImageService } from '../../services/image.service';
import type { GalleryMedia } from '../../../../core/interfaces/gallery-plugin.interface';

const PAGE_SIZE = 100;

type PermissionStatus = 'unknown' | 'granted' | 'denied';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [BackButton],
  templateUrl: './image-uploader.html',
  styleUrl: './image-uploader.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ImageUploader implements OnInit, OnDestroy {
  private readonly gallery = inject(GalleryService);
  private readonly imageService = inject(ImageService);
  private readonly navigation = inject(NavigationService);

  readonly id = input.required<string>();

  /** La galería nativa solo existe en la app Android (no en ng serve / web). */
  readonly isNative = Capacitor.isNativePlatform();

  readonly medias = signal<GalleryMedia[]>([]);
  readonly selected = signal<Map<string, GalleryMedia>>(new Map());
  readonly permission = signal<PermissionStatus>('unknown');
  readonly loading = signal(false);
  readonly hasMore = signal(false);
  readonly saving = signal(false);
  readonly savingProgress = signal({ done: 0, total: 0 });
  readonly error = signal<string | null>(null);

  private offset = 0;

  async ngOnInit(): Promise<void> {
    if (!this.isNative) return;
    await this.ensureAccess();
  }

  /** Si ya tenemos permiso cargamos directo (sin dialog); si no, lo pedimos. */
  private async ensureAccess(): Promise<void> {
    try {
      const current = await this.gallery.checkPermissions();
      if (current.mediaLibrary === 'granted' || current.storageLegacy === 'granted') {
        this.permission.set('granted');
        await this.loadFirstPage();
        return;
      }
    } catch {
      // Si el check falla, seguimos al pedido directo
    }
    await this.requestAccess();
  }

  async requestAccess(): Promise<void> {
    try {
      const perms = await this.gallery.requestPermissions();
      if (perms.mediaLibrary === 'granted' || perms.storageLegacy === 'granted') {
        this.permission.set('granted');
        await this.loadFirstPage();
      } else {
        this.permission.set('denied');
      }
    } catch (err) {
      this.permission.set('denied');
      this.error.set(this.message(err));
    }
  }

  async loadFirstPage(): Promise<void> {
    this.offset = 0;
    this.loading.set(true);
    this.error.set(null);
    try {
      const first = await this.gallery.getGallery(PAGE_SIZE, 0);
      this.medias.set(first.medias);
      this.offset = first.medias.length;
      this.hasMore.set(first.hasMore);
    } catch (err) {
      this.error.set(this.message(err));
    } finally {
      this.loading.set(false);
    }
  }

  /** Paginación por scroll: cerca del fondo pedimos la página siguiente. */
  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    const nearBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 200;
    if (nearBottom) {
      void this.loadMore();
    }
  }

  async loadMore(): Promise<void> {
    if (this.loading() || !this.hasMore()) return;
    this.loading.set(true);
    try {
      const next = await this.gallery.getGallery(PAGE_SIZE, this.offset);
      this.medias.update((current) => [...current, ...next.medias]);
      this.offset += next.medias.length;
      this.hasMore.set(next.hasMore);
    } catch (err) {
      this.error.set(this.message(err));
    } finally {
      this.loading.set(false);
    }
  }

  toggle(media: GalleryMedia): void {
    if (this.saving()) return;
    this.selected.update((current) => {
      const next = new Map(current);
      if (next.has(media.id)) {
        next.delete(media.id);
      } else {
        next.set(media.id, media);
      }
      return next;
    });
  }

  isSelected(id: string): boolean {
    return this.selected().has(id);
  }

  /** El plugin manda el thumbnail del grid como jpeg base64 (~256px). */
  thumbSrc(media: GalleryMedia): string {
    return media.thumbnail ? `data:image/jpeg;base64,${media.thumbnail}` : '';
  }

  /**
   * Guardado SECUENCIAL (for + await): cada base64 se convierte a Blob y se
   * suelta apenas termina. Disparar N promesas en paralelo acumularía N
   * strings base64 en el heap del WebView → OOM. Una foto que falle no
   * aborta el lote: se avisa y se sigue con la siguiente.
   */
  async save(): Promise<void> {
    if (this.saving() || this.selected().size === 0) return;

    this.saving.set(true);
    this.error.set(null);
    const albumId = this.id();
    const selected = [...this.selected().values()];
    this.savingProgress.set({ done: 0, total: selected.length });

    for (const media of selected) {
      try {
        await this.imageService.addFromGallery(albumId, media);
      } catch (err) {
        this.error.set(`No se pudo guardar "${media.name}": ${this.message(err)}`);
      }
      // LIMPIEZA: soltamos el base64 del thumbnail (este item ya no se usa)
      media.thumbnail = '';
      this.savingProgress.update((p) => ({ ...p, done: p.done + 1 }));
    }

    // Dejamos que el template alcance a pintar el progreso final antes de salir
    await new Promise((r) => setTimeout(r, 150));
    this.saving.set(false);
    this.navigation.back();
  }

  private message(err: unknown): string {
    if (err instanceof GalleryError) return err.message;
    const e = err as { message?: string };
    return e?.message ?? 'Error inesperado';
  }

  ngOnDestroy(): void {
    // No hay object URLs propias: los thumbnails del grid son data URIs y los
    // Blobs guardados ya viven en Dexie (los revoca AlbumDetail).
  }
}
