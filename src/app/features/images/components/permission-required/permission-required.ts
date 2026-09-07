// features/images/components/permission-required/permission-required.ts
// Pantalla de permisos DEDICADA (fix 1): el flujo pasa por acá cuando el
// guard ensureGalleryPermission encuentra que el permiso de galería no está
// concedido — album-list → (permiso faltante) → esta pantalla → album-detail.
//
// Reutiliza el mismo modelo de estados del picker (permission-status.util):
//  - 'prompt' → botón "Dar permisos" (el diálogo de Android puede reaparecer)
//  - 'denied' → botón "Abrir configuración" (permiso permanente: solo Settings)
// Al conceder el permiso (diálogo o vuelta de Settings) navega SOLA al
// album-detail — el usuario no tiene que volver a tocar el álbum en la lista.
import {
  Component,
  ChangeDetectionStrategy,
  input,
  inject,
  signal,
  OnInit,
  OnDestroy,
} from '@angular/core';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';

import { NavigationService } from '../../../../core/services/navigation.service';
import { GalleryError, GalleryService } from '../../../../core/services/gallery.service';
import { BackButton } from '../../../../shared/components/back-button/back-button';
import {
  toPermissionStatus,
  type PermissionStatus,
} from '../../../../core/utils/permission-status.util';

@Component({
  selector: 'app-permission-required',
  standalone: true,
  imports: [BackButton],
  templateUrl: './permission-required.html',
  styleUrl: './permission-required.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class PermissionRequired implements OnInit, OnDestroy {
  private readonly gallery = inject(GalleryService);
  private readonly navigation = inject(NavigationService);

  readonly albumId = input.required<string>();

  /** La galería nativa solo existe en la app Android (no en ng serve / web). */
  readonly isNative = Capacitor.isNativePlatform();

  readonly permission = signal<PermissionStatus>('unknown');
  readonly error = signal<string | null>(null);
  readonly loading = signal(false);

  /** Handle del listener de retorno a primer plano (removido en destroy). */
  private appStateListener?: Promise<PluginListenerHandle>;

  async ngOnInit(): Promise<void> {
    if (!this.isNative) return;
    // Re-check al volver de Settings: si el usuario activó el permiso ahí, la
    // pantalla navega sola al detail (sin que tenga que tocar nada más).
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.appStateListener = App.addListener('appStateChange', this.onAppStateChange);
    await this.ensureAccess();
  }

  /** Back → album-list (historial limpio): canceló el flujo de permisos. */
  onBack(): void {
    this.navigation.toAlbumList();
  }

  /**
   * Primer check al llegar. Con permiso (deep link directo a la pantalla de
   * permisos, o el guard se ejecutó con un check fallido) → album-detail
   * directo. Sin permiso → deja que la UI muestre el botón correcto.
   */
  private async ensureAccess(): Promise<void> {
    this.loading.set(true);
    let status: PermissionStatus;
    try {
      const current = await this.gallery.checkPermissions();
      status = toPermissionStatus(current);
    } catch {
      // Check caído: asumir que se puede preguntar (botón "Dar permisos")
      status = 'prompt';
    }
    this.loading.set(false);
    this.permission.set(status);

    if (status === 'granted') {
      this.navigation.toAlbumDetail(this.albumId());
    }
  }

  /** Botón "Dar permisos": pide el diálogo de Android y navega al conceder. */
  async requestAccess(): Promise<void> {
    this.error.set(null);
    try {
      const perms = await this.gallery.requestPermissions();
      const status = toPermissionStatus(perms);
      this.permission.set(status);
      if (status === 'granted') {
        this.navigation.toAlbumDetail(this.albumId());
      }
    } catch (err) {
      // No es un deny permanente → sigue con "Dar permisos" para reintentar.
      this.permission.set('prompt');
      this.error.set(this.message(err));
    }
  }

  /**
   * Botón "Abrir configuración": estado 'denied' permanente (2+ denegaciones).
   * Al volver, el re-check (visibilitychange/appStateChange) detecta el
   * permiso y navega sola al detail.
   */
  async openSettings(): Promise<void> {
    try {
      await this.gallery.openGallerySettings();
    } catch (err) {
      this.error.set(this.message(err));
    }
  }

  private readonly onVisibilityChange = (): void => {
    if (document.visibilityState === 'visible' && this.permission() !== 'granted') {
      void this.ensureAccess();
    }
  };

  private readonly onAppStateChange = ({ isActive }: { isActive: boolean }): void => {
    if (isActive && this.permission() !== 'granted') {
      void this.ensureAccess();
    }
  };

  ngOnDestroy(): void {
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    void this.appStateListener?.then((h) => h.remove());
  }

  private message(err: unknown): string {
    if (err instanceof GalleryError) return err.message;
    const e = err as { message?: string };
    return e?.message ?? 'Error inesperado';
  }
}