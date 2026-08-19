import { Directive, ElementRef, inject, input, output, OnDestroy } from '@angular/core';

/**
 * Directive de long-press para touch devices.
 *
 * Detecta un toque prolongado (500ms) en el elemento host. Si el usuario
 * mueve el dedo más de 10px (scroll), se cancela — evita falsos positivos
 * al navegar por el álbum.
 *
 * Durante el long-press agrega la clase CSS `long-pressing` al host para
 * permitir indicadores visuales (anillo, escala, etc.).
 *
 * Uso:
 * ```html
 * <div appLongPress (longPress)="onCopy(sticker)">
 * ```
 */
@Directive({
  selector: '[appLongPress]',
  host: {
    '(touchstart)': 'onTouchStart($event)',
    '(touchend)': 'onTouchEnd()',
    '(touchmove)': 'onTouchMove($event)',
    '(touchcancel)': 'onCancel()',
  },
})
export class LongPressDirective implements OnDestroy {
  private readonly el = inject(ElementRef<HTMLElement>);

  /** Delay en ms antes de disparar el long-press. */
  readonly delay = input(500);

  /** Umbral de movimiento en px para cancelar (distingue scroll de long-press). */
  readonly moveThreshold = input(10);

  /** Evento emitido cuando el long-press se completa exitosamente. */
  readonly longPress = output<void>();

  private timer: ReturnType<typeof setTimeout> | null = null;
  private startX = 0;
  private startY = 0;

  onTouchStart(event: TouchEvent): void {
    this.cancel();
    const touch = event.touches[0];
    this.startX = touch.clientX;
    this.startY = touch.clientY;

    this.timer = setTimeout(() => {
      this.timer = null;
      this.el.nativeElement.classList.add('long-pressing');
      this.longPress.emit();
      // Quitar la clase después de un tick para que el componente
      // pueda reaccionar al feedback visual
      setTimeout(() => this.el.nativeElement.classList.remove('long-pressing'), 300);
    }, this.delay());
  }

  onTouchMove(event: TouchEvent): void {
    if (!this.timer) return;
    const touch = event.touches[0];
    const dx = Math.abs(touch.clientX - this.startX);
    const dy = Math.abs(touch.clientY - this.startY);
    if (dx > this.moveThreshold() || dy > this.moveThreshold()) {
      this.cancel();
    }
  }

  onTouchEnd(): void {
    this.cancel();
  }

  onCancel(): void {
    this.cancel();
  }

  ngOnDestroy(): void {
    this.cancel();
  }

  private cancel(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }
}
