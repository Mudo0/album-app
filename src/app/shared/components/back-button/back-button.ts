import { Component, ChangeDetectionStrategy, output } from '@angular/core';

/**
 * Botón de retroceso PRESENTACIONAL PURO: solo renderiza y emite `back`.
 *
 * NO inyecta navegación ni decide nada sobre hacia dónde volver: la regla de
 * navegación la declara SIEMPRE el consumidor vía `(back)="onBack()"`. Esto
 * elimina de raíz la fragilidad de depender de internals del output (si hay o
 * no listeners conectados) — el botón se limita a reportar el gesto.
 */
@Component({
  selector: 'app-back-button',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: ` <button class="back" (click)="back.emit()" aria-label="Volver">←</button> `,
  styles: `
    .back {
      width: 36px;
      height: 36px;
      border: none;
      background: none;
      font-size: 1.25rem;
      cursor: pointer;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #4f46e5;
    }

    .back:active {
      background: #f4f4f5;
    }
  `,
})
export class BackButton {
  /** Emitido al tocar el botón. El consumidor decide cómo volver. */
  readonly back = output<void>();
}
