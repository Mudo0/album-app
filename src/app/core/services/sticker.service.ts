import { Injectable } from '@angular/core';

export interface BoundingBox {
  /** Offset X del píxel visible más a la izquierda (en px naturales). */
  x: number;
  /** Offset Y del píxel visible más arriba (en px naturales). */
  y: number;
  /** Ancho del área visible (en px naturales). */
  width: number;
  /** Alto del área visible (en px naturales). */
  height: number;
}

/**
 * Servicio utilitario para análisis de stickers/imágenes.
 *
 * Proporciona bounds del contenido visible (sin transparencias)
 * usando canvas + pixel scanning. Útil para:
 * - Bordes decorativos alineados al contenido real
 * - Hit-testing sobre píxeles visibles
 * - Detección de colisiones entre stickers
 */
@Injectable({ providedIn: 'root' })
export class StickerService {
  /** Cache de bounds por src de imagen. */
  private cache = new Map<string, BoundingBox>();

  /**
   * Devuelve el bounding box del contenido visible de una imagen
   * (recortando transparencias completamente opacas).
   *
   * El resultado está en píxeles naturales de la imagen.
   * Para convertir a coordenadas de display, dividí por la escala:
   *   displayBounds.x = bounds.x * (displayWidth / naturalWidth)
   *
   * **Requiere que la imagen esté cargada** (complete === true).
   * Si no lo está, retorna null.
   */
  getTrimmedBounds(imgElement: HTMLImageElement): BoundingBox | null {
    if (!imgElement.complete || imgElement.naturalWidth === 0) return null;

    const src = imgElement.src;
    const cached = this.cache.get(src);
    if (cached) return cached;

    const bounds = this.computeTrimmedBounds(imgElement);
    if (bounds) this.cache.set(src, bounds);
    return bounds;
  }

  /**
   * Invalida la entrada de cache para una imagen específica.
   * Llamar si se reemplaza el contenido de la imagen.
   */
  invalidate(src: string): void {
    this.cache.delete(src);
  }

  /** Limpia todo el cache. */
  clearCache(): void {
    this.cache.clear();
  }

  private computeTrimmedBounds(img: HTMLImageElement): BoundingBox | null {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;

    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    ctx.drawImage(img, 0, 0);

    const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;
    let hasPixels = false;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const alpha = data[(y * width + x) * 4 + 3];
        if (alpha > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
          hasPixels = true;
        }
      }
    }

    if (!hasPixels) return null;

    return {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    };
  }
}
