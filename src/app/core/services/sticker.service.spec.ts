import { StickerService } from './sticker.service';

/**
 * Crea un HTMLImageElement con píxeles controlados usando canvas.
 * En jsdom, canvas no renderiza — por eso mockeamos getContext + getImageData.
 */
function createTestImage(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): HTMLImageElement {
  const img = new Image();

  const imageData = { data, width, height };

  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      drawImage: () => {},
      getImageData: () => imageData,
    } as unknown as CanvasRenderingContext2D;
  } as typeof originalGetContext;

  Object.defineProperty(img, 'complete', { value: true, writable: false });
  Object.defineProperty(img, 'naturalWidth', { value: width, writable: false });
  Object.defineProperty(img, 'naturalHeight', { value: height, writable: false });

  img.src = `data:image/png;base64,${btoa('test')}`;

  queueMicrotask(() => {
    HTMLCanvasElement.prototype.getContext = originalGetContext;
  });

  return img;
}

function makeTransparentData(width: number, height: number): Uint8ClampedArray {
  return new Uint8ClampedArray(width * height * 4);
}

function paintRect(
  data: Uint8ClampedArray,
  width: number,
  rect: { x: number; y: number; w: number; h: number },
  color: [number, number, number, number] = [255, 0, 0, 255],
): void {
  for (let y = rect.y; y < rect.y + rect.h; y++) {
    for (let x = rect.x; x < rect.x + rect.w; x++) {
      const i = (y * width + x) * 4;
      data[i] = color[0];
      data[i + 1] = color[1];
      data[i + 2] = color[2];
      data[i + 3] = color[3];
    }
  }
}

describe('StickerService', () => {
  let service: StickerService;

  beforeEach(() => {
    service = new StickerService();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  // ── Imagen completamente transparente ──

  it('should return null for fully transparent image', () => {
    const data = makeTransparentData(100, 100);
    const img = createTestImage(data, 100, 100);

    const bounds = service.getTrimmedBounds(img);

    expect(bounds).toBeNull();
  });

  // ── Rectángulo conocido ──

  it('should detect a red rectangle at known position', () => {
    const W = 200, H = 200;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 20, y: 40, w: 50, h: 30 });
    const img = createTestImage(data, W, H);

    const bounds = service.getTrimmedBounds(img)!;

    expect(bounds).not.toBeNull();
    expect(bounds.x).toBe(20);
    expect(bounds.y).toBe(40);
    expect(bounds.width).toBe(50);
    expect(bounds.height).toBe(30);
  });

  // ── Imagen llena ──

  it('should return full dimensions when all pixels are visible', () => {
    const W = 100, H = 80;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 0, y: 0, w: W, h: H });
    const img = createTestImage(data, W, H);

    const bounds = service.getTrimmedBounds(img)!;

    expect(bounds).toEqual({ x: 0, y: 0, width: W, height: H });
  });

  // ── Múltiples regiones separadas ──

  it('should encompass all visible regions', () => {
    const W = 200, H = 200;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 10, y: 10, w: 20, h: 20 });
    paintRect(data, W, { x: 80, y: 90, w: 30, h: 10 });
    const img = createTestImage(data, W, H);

    const bounds = service.getTrimmedBounds(img)!;

    expect(bounds.x).toBe(10);
    expect(bounds.y).toBe(10);
    expect(bounds.width).toBe(100);  // 80 + 30 - 10
    expect(bounds.height).toBe(90);  // 90 + 10 - 10
  });

  // ── Cache ──

  it('should cache and return same result on second call', () => {
    const W = 100, H = 100;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 10, y: 10, w: 30, h: 20 });
    const img = createTestImage(data, W, H);

    const first = service.getTrimmedBounds(img);
    const second = service.getTrimmedBounds(img);

    expect(first).toEqual(second);
  });

  it('should invalidate cache for specific src', () => {
    const W = 100, H = 100;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 0, y: 0, w: 50, h: 50 });
    const img = createTestImage(data, W, H);

    service.getTrimmedBounds(img);
    service.invalidate(img.src);

    const bounds = service.getTrimmedBounds(img);
    expect(bounds).not.toBeNull();
  });

  it('should clear entire cache', () => {
    const W = 100, H = 100;
    const data = makeTransparentData(W, H);
    paintRect(data, W, { x: 0, y: 0, w: W, h: H });
    const img = createTestImage(data, W, H);

    service.getTrimmedBounds(img);
    service.clearCache();

    const bounds = service.getTrimmedBounds(img);
    expect(bounds).toEqual({ x: 0, y: 0, width: W, height: H });
  });

  // ── Imagen no cargada ──

  it('should return null for image not yet loaded', () => {
    const img = new Image();

    const bounds = service.getTrimmedBounds(img);

    expect(bounds).toBeNull();
  });
});
