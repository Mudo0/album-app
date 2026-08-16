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
// Tope del plugin nativo: 50. Usamos 25 para dejar margen al payload del
// puente (25 thumbs webp 512px ≈ 0.5-1.5MB por llamada) y progreso más fino.
const BATCH_SIZE = 25;

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
   * Guardado en LOTES de BATCH_SIZE: cada lote es UNA llamada nativa
   * (getMediaThumbnails) que genera los thumbs EN PARALELO en Kotlin y cruza
   * el puente una sola vez, en vez de una llamada por foto. Los base64 del
   * grid de cada lote se sueltan apenas termina (memoria/OOM). Un lote que
   * falle no aborta el resto: se avisa y se sigue con el próximo.
   */
  async save(): Promise<void> {
    if (this.saving() || this.selected().size === 0) return;

    this.saving.set(true);
    this.error.set(null);
    const albumId = this.id();
    const selected = [...this.selected().values()];
    this.savingProgress.set({ done: 0, total: selected.length });

    for (let i = 0; i < selected.length; i += BATCH_SIZE) {
      const batch = selected.slice(i, i + BATCH_SIZE);
      try {
        await this.imageService.addManyFromGallery(albumId, batch);
      } catch (err) {
        // El error agregado ya trae los nombres de las fotos fallidas
        this.error.set(this.message(err));
      }
      // LIMPIEZA: soltamos los base64 del grid de este lote (ya no se usan)
      for (const media of batch) media.thumbnail = '';
      this.savingProgress.update((p) => ({ ...p, done: p.done + batch.length }));
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
