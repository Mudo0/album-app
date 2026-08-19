/**
 * Convierte un string base64 en Blob.
 *
 * MEMORIA (OOM del WebView): un base64 ocupa ~4/3 del tamaño original, y en JS
 * los strings suman 2 bytes por carácter (UTF-16). Después de llamar esta
 * función, soltá la referencia al string apenas termines (dejalo salir del
 * scope / asigná null) para que el GC la libere — sobre todo al procesar
 * varias fotos seguidas.
 */
export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new Blob([bytes], { type: mimeType });
}
