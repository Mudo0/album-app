// core/services/updates/update-plugin.token.ts
import { InjectionToken } from '@angular/core';
import { registerPlugin } from '@capacitor/core';
import type { UpdatePluginInterface } from './native-update.interface';

/**
 * Token del plugin nativo Update. En tests se provee un mock con useValue;
 * en runtime el factory registra el plugin real (registerPlugin es seguro
 * aunque el plugin nativo no exista, p.ej. en web: las llamadas rechazan —
 * y el checker las evita con el gate de plataforma).
 */
export const UPDATE_PLUGIN = new InjectionToken<UpdatePluginInterface>(
  'UpdatePlugin',
  {
    providedIn: 'root',
    factory: () => registerPlugin<UpdatePluginInterface>('Update'),
  },
);