import {
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  ChangeDetectionStrategy,
  OnDestroy,
  OnInit,
  viewChild,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import {
  CdkVirtualScrollViewport,
  ScrollingModule,
} from '@angular/cdk/scrolling';
import type { ListRange } from '@angular/cdk/collections';
import { Subscription } from 'rxjs';

import { NavigationService } from '../../../../core/services/navigation.service';
import { BackButton } from '../../../../shared/components/back-button/back-button';
import { GalleryError, GalleryService } from '../../../../core/services/gallery.service';
import { ImageService } from '../../services/image.service';
import type { GalleryMedia } from '../../../../core/interfaces/gallery-plugin.interface';
import { base64ToBlob } from '../../../../core/utils/base64.util';

const PAGE_SIZE = 100;
// Tope del plugin nativo: 50. Usamos 25 para dejar margen al payload del
// puente (25 thumbs webp 512px ≈ 0.5-1.5MB por llamada) y progreso más fino.
const BATCH_SIZE = 25;

// Virtual scroll: el grid es de COLS columnas fijas; cada "item" virtual es
// una FILA (el CDK virtualiza items lineales). El alto de fila es dinámico
// (ancho de celda + gap) y se recalcula con ResizeObserver.
const COLS = 3;
const GRID_GAP = 6;
const GRID_PADDING = 16;
const LOAD_MORE_THRESHOLD = 6; // filas de margen antes del borde para paginar

// Cache LRU de thumbs: id -> objectURL. Tope duro de blobs vivos; al evictar
// se revoca el URL (el blob muere). El string base64 muere al instante al
// convertirse a Blob → el heap del WebView queda acotado a un instante.
const THUMB_CACHE_MAX = 200;
// Debounce del fling: un scroll agresivo no dispara N batchs al puente, solo
// los de las ventanas estables (más un máximo de UN batch en vuelo a la vez).
const THUMB_DEBOUNCE_MS = 120;

type PermissionStatus = 'unknown' | 'granted' | 'denied';

@Component({
  selector: 'app-image-uploader',
  standalone: true,
  imports: [BackButton, ScrollingModule],
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

  /** Cache LRU de thumbs (id -> objectURL). Se lee como signal para que el
   * render OnPush se actualice cuando llega un batch. */
  readonly thumbs = signal<Map<string, string>>(new Map());

  /** Alto de fila del grid (ancho de celda + gap), recalculado por resize. */
  readonly rowHeight = signal(0);

  /** Viewport del virtual scroll — CONDICIONAL: solo existe cuando el permiso
   * fue concedido (el @if del template). Por eso se consulta sin required y el
   * effect de abajo reacciona a su aparición. */
  readonly viewport = viewChild(CdkVirtualScrollViewport);

  constructor() {
    // El viewport nace cuando el @if se activa (permiso concedido). El effect
    // re-corre cuando la señal cambia de undefined a instancia y arma ahí las
    // suscripciones. Suscripción programática además porque el template checker
    // no tipa bien los streams del CDK v21 (renderedRangeChange ya no es
    // @Output; ahora es renderedRangeStream, un Observable plano).
    effect(() => {
      const viewport = this.viewport();
      if (viewport === undefined) return;

      this.subscriptions.add(
        viewport.scrolledIndexChange.subscribe((i) => this.onScrolledIndex(i)),
      );
      this.subscriptions.add(
        viewport.renderedRangeStream.subscribe((r) => this.onRenderedRange(r)),
      );

      // jsdom (tests) no implementa ResizeObserver: el alto de fila se queda
      // en 0 y el CDK no renderiza items, lo cual está bien para los specs.
      if (typeof ResizeObserver === 'undefined') return;

      this.resizeObserver?.disconnect();
      this.resizeObserver = new ResizeObserver((entries) => {
        const width = entries[0]?.contentRect.width ?? 0;
        if (width <= 0) return;
        const cell = (width - GRID_PADDING * 2 - GRID_GAP * (COLS - 1)) / COLS;
        this.rowHeight.set(Math.round(cell + GRID_GAP));
        // Un cambio de tamaño de fila puede descalibrar el scroll del CDK
        viewport.checkViewportSize();
      });
      this.resizeObserver.observe(viewport.elementRef.nativeElement as HTMLElement);
    });
  }

  /** Los medias agrupados en FILAS de COLS — cada fila es un item virtual. */
  readonly rows = computed<GalleryMedia[][]>(() => {
    const all = this.medias();
    const out: GalleryMedia[][] = [];
    for (let i = 0; i < all.length; i += COLS) {
      out.push(all.slice(i, i + COLS));
    }
    return out;
  });

  /**
   * Identidad de una fila = id de su primera foto. Como las páginas solo se
   * APPENDAN, las filas existentes nunca cambian → el CDK no recicla nada al
   * paginar (las filas nuevas simplemente se agregan).
   */
  trackRow(_index: number, row: GalleryMedia[]): string {
    return row[0]?.id ?? `row-${_index}`;
  }

  private offset = 0;
  private resizeObserver?: ResizeObserver;
  private debounceTimer?: ReturnType<typeof setTimeout>;
  private readonly pendingThumbs = new Set<string>();
  private fetchInFlight = false;
  private readonly subscriptions = new Subscription();

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

  /**
   * Paginación por scroll del virtual scroll: cuando la primera fila
   * renderizada se acerca al final de lo cargado, pedimos la página siguiente.
   */
  onScrolledIndex(index: number): void {
    // El viewport no existe si el permiso todavía no se concedió.
    const viewport = this.viewport();
    if (viewport === undefined) return;
    const totalRows = this.rows().length;
    const visibleRows = viewport.getViewportSize() / Math.max(this.rowHeight(), 1);
    if (index + visibleRows >= totalRows - LOAD_MORE_THRESHOLD) {
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

  /**
   * Lazy loading por ventana: al cambiar el rango renderizado (CDK solo monta
   * la ventana visible + overscan), juntamos los ids sin thumb y agendamos un
   * batch con debounce. Los que ya están en cache no se vuelven a pedir.
   */
  onRenderedRange(range: ListRange): void {
    const thumbs = this.thumbs();
    const medias = this.medias();
    for (let i = range.start * COLS; i < range.end * COLS && i < medias.length; i++) {
      const media = medias[i];
      if (!thumbs.has(media.id)) {
        this.pendingThumbs.add(media.id);
      }
    }
    this.scheduleFlush();
  }

  private scheduleFlush(): void {
    if (this.debounceTimer !== undefined) return;
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = undefined;
      void this.flushThumbs();
    }, THUMB_DEBOUNCE_MS);
  }

  /**
   * Manda el batch de thumbs pendientes. Máximo UNO en vuelo: si llegan
   * pendientes durante el vuelo, se encolan y se mandan al terminar. Los
   * resultados SIEMPRE entran al cache (el LRU los sirve si el usuario vuelve
   * a esa zona) — "cancelar" una llamada ya enviada al puente no se puede.
   *
   * Los pendientes se mandan en TROZOS de BATCH_SIZE: el plugin nativo valida
   * máx. 50 uris por llamada y un scroll rápido puede acumular cientos de
   * pendientes (rango renderizado grande).
   */
  private async flushThumbs(): Promise<void> {
    if (this.pendingThumbs.size === 0 || this.fetchInFlight) return;

    const ids = [...this.pendingThumbs];
    this.pendingThumbs.clear();
    this.fetchInFlight = true;

    try {
      const byId = new Map(this.medias().map((m) => [m.id, m]));
      const batch = ids
        .map((id) => byId.get(id))
        .filter((m): m is GalleryMedia => m !== undefined);

      // El grid usa el thumb del SISTEMA a 256px jpeg (liviano para el DOM)
      for (let i = 0; i < batch.length; i += BATCH_SIZE) {
        const chunk = batch.slice(i, i + BATCH_SIZE);
        const thumbs = await this.gallery.getMediaThumbnails(
          chunk.map((m) => m.uri),
          { size: 256, format: 'jpeg' },
        );

        thumbs.forEach((thumb, j) => {
          const media = chunk[j];
          if (thumb == null || media === undefined) return; // falló: se saltea
          const blob = base64ToBlob(thumb.data, thumb.mimeType);
          this.cacheThumb(media.id, URL.createObjectURL(blob));
        });
      }
    } catch {
      // Un batch caído no rompe el picker; los pendientes se re-agendan abajo
    } finally {
      this.fetchInFlight = false;
      if (this.pendingThumbs.size > 0) this.scheduleFlush();
    }
  }

  /** Inserta en el LRU y evicta el más viejo (revocando su objectURL). */
  private cacheThumb(id: string, url: string): void {
    const next = new Map(this.thumbs());
    next.delete(id); // re-insertar al final: política LRU por orden de inserción
    next.set(id, url);

    while (next.size > THUMB_CACHE_MAX) {
      const first = next.entries().next().value as [string, string] | undefined;
      if (first === undefined) break;
      URL.revokeObjectURL(first[1]);
      next.delete(first[0]);
    }
    this.thumbs.set(next);
  }

  /** ObjectURL del thumb si está en cache; placeholder vacío si no. */
  thumbSrc(media: GalleryMedia): string {
    return this.thumbs().get(media.id) ?? '';
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

  /**
   * Guardado en LOTES de BATCH_SIZE: cada lote es UNA llamada nativa
   * (getMediaThumbnails) que genera los thumbs EN PARALELO en Kotlin y cruza
   * el puente una sola vez, en vez de una llamada por foto. Un lote que falle
   * no aborta el resto: se avisa y se sigue con el próximo.
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
      this.savingProgress.update((p) => ({ ...p, done: p.done + batch.length }));
    }

    // Dejamos que el template alcance a pintar el progreso final antes de salir
    await new Promise((r) => setTimeout(r, 150));
    this.saving.set(false);
    this.navigation.back();
  }

  ngOnDestroy(): void {
    // Liberar TODOS los objectURLs: sin revoke quedan blobs huérfanos en la
    // sesión del WebView reteniendo memoria hasta que muera la app.
    this.subscriptions.unsubscribe();
    this.resizeObserver?.disconnect();
    if (this.debounceTimer !== undefined) clearTimeout(this.debounceTimer);
    for (const url of this.thumbs().values()) {
      URL.revokeObjectURL(url);
    }
  }

  private message(err: unknown): string {
    if (err instanceof GalleryError) return err.message;
    const e = err as { message?: string };
    return e?.message ?? 'Error inesperado';
  }
}
