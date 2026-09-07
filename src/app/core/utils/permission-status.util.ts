// core/utils/permission-status.util.ts
// Estado de permisos de galería reducido a lo que la UI necesita distinguir.
// Compartido por image-uploader (candado del picker) y permission-required
// (pantalla de permisos dedicada).
import type { MediaPermissions } from '../models/media-permissions.model';

export type PermissionStatus = 'unknown' | 'granted' | 'prompt' | 'denied';

/**
 * Reduce el PermissionState de Capacitor a nuestro PermissionStatus de UI:
 *  - 'prompt' zanja los dos estados "se puede volver a preguntar" de Capacitor
 *    ('prompt' y 'prompt-with-rationale'): el diálogo de Android puede reaparecer.
 *  - 'denied' = denegado PERMANENTE (2+ denegaciones / "don't ask again"): el
 *    diálogo ya no vuelve; el permiso solo se restaura desde Settings.
 */
export function toPermissionStatus(perms: MediaPermissions): PermissionStatus {
  const state = perms.mediaLibrary ?? perms.storageLegacy;
  if (state === 'granted') return 'granted';
  if (state === 'denied') return 'denied';
  return 'prompt';
}