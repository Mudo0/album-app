import { Directive, ElementRef, inject, input, output, OnDestroy } from '@angular/core';

/** Coordenadas del toque/click que disparó el long-press. */
export interface LongPressPosition {
  x: number;
  y: number;
}

/**
 * Directive de long-press multiplatform (touch + mouse).
 *
 * Detecta un toque prolongado (500ms) en el elemento host.
 * - Touch: cancela si el dedo se mueve más de 10px (distingue scroll de long-press).
 * - Mouse: cancela si el cursor se mueve más de 10px del punto inicial.
 *
 * Durante el long-press agrega la clase CSS `long-pressing` al host para
 * permitir indicadores visuales (anillo, escala, etc.).
 *
 * Uso:
 * ```html
 * <div appLongPress (longPress)="onMenu($event)">
 * ```
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    // Touch
    '(touchstart)': 'onStart($event)',
    '(touchend)': 'onEnd()',
    '(touchmove)': 'onMove($event)',
    '(touchcancel)': 'onCancel()',
    // Mouse
    '(mousedown)': 'onStart($event)',
    '(mouseup)': 'onEnd()',
    '(mousemove)': 'onMove($event)',
    '(mouseleave)': 'onCancel()',
    // Bloquear context menu del browser en desktop
    '(contextmenu)': 'onContextMenu($event)',
  },
})
export class LongPressDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);

  /** Delay en ms antes de disparar el long-press. */
  readonly delay = input(500);

  /** Umbral de movimiento en px para cancelar. */
  readonly moveThreshold = input(10);

  /** Deshabilitar long-press (ej: cuando CDK drag está activo). */
  readonly disabled = input(false, { alias: 'appLongPressDisabled' });

  /** Evento emitido cuando el long-press se completa exitosamente. */
  readonly longPress = output<LongPressPosition>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;

  // ── Unified handlers ──

  onStart(event: TouchEvent | MouseEvent): void {
    this.cancel();
    if (this.disabled()) return;

    const pos = this.getPosition(event);
    this.startX = pos.x;
    this.startY = pos.y;

    this.timer = setTimeout(() => {
      this.timer = null;
      // Re-verificar: si el drag arrancó mientras esperábamos, no disparar
      if (this.disabled()) return;
      this.el.nativeElement.classList.add('long-pressing');
      this.longPress.emit({ x: this.startX, y: this.startY });
      // Quitar la clase después de un tick para que el componente
      // pueda reaccionar al feedback visual
      setTimeout(() => this.el.nativeElement.classList.remove('long-pressing'), 300);
    }, this.delay());
  }

  onMove(event: TouchEvent | MouseEvent): void {
    if (!this.timer) return;
    const pos = this.getPosition(event);
    const dx = Math.abs(pos.x - this.startX);
    const dy = Math.abs(pos.y - this.startY);
    if (dx > this.moveThreshold() || dy > this.moveThreshold()) {
      this.cancel();
    }
  }

  onEnd(): void {
    this.cancel();
  }

  onCancel(): void {
    this.cancel();
  }

  /** Prevenir que aparezca el context menu del browser al hacer long-press con mouse. */
  onContextMenu(event: Event): void {
    if (this.timer !== null) {
      event.preventDefault();
    }
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  // ── Private ──

  private getPosition(event: TouchEvent | MouseEvent): LongPressPosition {
    if ('touches' in event) {
      const touch = event.touches[0];
      return { x: touch.clientX, y: touch.clientY };
    }
    return { x: event.clientX, y: event.clientY };
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
