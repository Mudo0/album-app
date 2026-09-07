// features/updates/update-dialog.ts
// UI del auto-update (B5 del spec). Render en el host App vía @if — sin overlay
// de CDK ni ruta. Cuatro vistas según las signals del checker:
//   1. "Nueva versión disponible" (idle) → Actualizar ahora / Más tarde
//   2. Descarga en curso (downloading) → spinner o barra de progreso
//   3. "Lista para instalar" (ready) → Instalar ahora
//   4. Error (descarga o instalación) → mensaje + Reintentar
import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { UpdateCheckerService } from '../../core/services/updates/update-checker.service';

@Component({
  selector: 'app-update-dialog',
  standalone: true,
  imports: [],
  templateUrl: './update-dialog.html',
  styleUrl: './update-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UpdateDialog {
  private readonly checker = inject(UpdateCheckerService);

  readonly available = this.checker.available;
  readonly info = this.checker.info;
  readonly download = this.checker.download;

  /** Progreso 0..1 de la descarga en curso (null si aún sin bytes). */
  readonly downloadProgress = computed(() => {
    const dl = this.download();
    return dl.type === 'downloading' ? dl.progress : null;
  });

  /** Progreso en % para la barra (0 cuando no hay valores todavía). */
  readonly downloadRatio = computed(() => (this.downloadProgress() ?? 0) * 100);

  /** Mensaje del error (descarga o instalación). */
  readonly errorMessage = computed(() => {
    const dl = this.download();
    return dl.type === 'error' ? dl.message : null;
  });

  onUpdateNow(): void {
    void this.checker.startDownload();
  }

  onLater(): void {
    this.checker.dismissUpdate();
  }

  onInstall(): void {
    void this.checker.installReady();
  }

  onRetry(): void {
    const dl = this.download();
    // Error de instalación (p.ej. orígenes desconocidos) → reintentar instalar;
    // error de descarga o de check → reiniciar la descarga.
    if (dl.type === 'error' && dl.install) {
      void this.checker.installReady();
    } else {
      void this.checker.startDownload();
    }
  }
}