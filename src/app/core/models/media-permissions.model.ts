import type { PermissionState } from '@capacitor/core';

export interface MediaPermissions {
  mediaLibrary: PermissionState;
  storageLegacy: PermissionState;
}
