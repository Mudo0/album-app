# Fixes — Galería: flujo de permisos y orden z

> Estado: COMPLETADO (2026-09-07) — los 3 fixes fueron aplicados y verificados.
> Diagnóstico con evidencia del source de Capacitor 8.5.0.

---

## Resumen de lo aplicado

### Fix 1 — Permisos (API 33+)

- **GalleryPlugin.kt**: `requestPermissions` pide SOLO el alias que aplica según
  API level (`mediaLibrary` ≥ 33, `storageLegacy` < 33) vía
  `requestPermissionForAlias(alias, call, "permissionsCallback")`, en vez de
  `requestAllPermissions` (que pedía un permiso inexistente en el manifest
  efectivo de Android 13+).
- **gallery.service.ts**: el mensaje crudo `Missing the following permissions`
  del framework se mapea a un `GalleryError` `accessDenied` user-friendly.
- **image-uploader.ts**: re-check al volver al primer plano
  (`document.visibilitychange` + `App.addListener('appStateChange')`) solo si
  `permission() === 'denied'`; `error.set(null)` al reintentar y al pasar a
  granted; handlers removidos en `ngOnDestroy`.

### Fix 2 — Orden z persistente

- **album-detail.ts** `onDragEnded`: reordena el array moviendo el sticker
  arrastrado al final (traer al frente) y persiste el order del array ya
  reordenado.
- **local-image.repository.ts** `getLastByAlbum`: `sortBy('order')` + `.at(-1)`
  (corrige el bug latente: `.last()` recorría el índice por UUID).

### Fix 3 — Back del picker según permiso (DESVÍO documentado)

El plan original proponía un output opcional en `BackButton` con fallback
`if (this.back.observers.length === 0) this.navigation.back()`. **Ese approach
no compila en Angular 21.2.19**: `OutputEmitterRef` no expone `.observers`
(el field interno es `listeners`, no oficial).

Desvío consultado y aprobado por el usuario — **inversión de control pura**
(opción C):

- **back-button.ts**: presentacional PURO — solo `readonly back = output<void>()`,
  sin DI de `NavigationService` ni fallback condicional.
- **navigation.service.ts**: capa centralizada — `back()`, `toAlbumDetail()`,
  `toAlbumList()`.
- **image-uploader / album-detail / album-form**: `<app-back-button (back)="onBack()" />`
  con `onBack()` de una línea en cada pantalla. El picker aplica la regla por
  permiso: denied → `toAlbumList()`; granted → `back()`.
- **Botón físico de Android** en el picker (`App.addListener('backButton')` →
  `this.onBack()`), con cleanup en `ngOnDestroy`.

### Verificación

- **`npm test`: 16 archivos, 173 tests, todos verdes** (antes: 158).
- Tests actualizados: drag con reorden, `getLastByAlbum` por order,
  `toAlbumList()`, mapeo de permisos crudos → accessDenied, re-check al primer
  plano, back por estado de permiso, gesto físico, cleanup de listeners.
- Mock de `@capacitor/app` en `image-uploader.spec.ts` con `vi.hoisted`
  (patrón de `update-checker.service.spec.ts`).

### Descartado por decisión del usuario (2026-09-07)

- Manejo del deny permanente ("Don't ask again"): **NO se implementa**.
  - Evidencia empírica del flujo real: negar el diálogo una vez y volver a
    entrar al picker → el diálogo se vuelve a mostrar (el usuario puede dar
    permisos de nuevo). Comportamiento esperado según la doc oficial de
    Android: una sola negación deja el permiso en estado `prompt`; recién tras
    2+ negaciones (`USER_FIXED`) deja de mostrarse el diálogo. Además,
    descartar el diálogo con back NO cuenta como deny.
  - El custom plugin Android
    (`Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, ...)`) solo
    aplicaba al caso límite de doble denegación → no justifica plugin nativo
    para el flujo real de la app.
  - OJO (verificado): **no existe `App.openSettings()`** en `@capacitor/app`
    8.1.1 (ni `AppLauncher.openSettings()` en `@capacitor/app-launcher`). Si
    algún día se retoma, es con custom plugin.
- Control fino de profundidad (`zIndex` + migración Dexie).

---

## Fix 1 — Primera instalación: error técnico de permisos + pantalla bloqueada

### Síntoma

1. Primera vez que se abre el picker, el diálogo nativo de permisos aparece.
   Al **negar** el acceso, en vez de la pantalla de candado amigable se muestra
   un error técnico: `missing the following permissions in android...`.
2. Aunque después se **otorgue** el permiso (settings o re-tap del diálogo), la
   pantalla sigue bloqueada con el candado "Necesitamos acceso" y el mensaje de
   error no desaparece.
3. Recién al **tocar "Dar permisos" una vez más** se abre la galería.

### Causa raíz (confirmada)

El mensaje `Missing the following permissions in AndroidManifest.xml` sale del
framework de Capacitor (no de nuestro código). En
`android/capacitor/src/main/java/com/getcapacitor/Bridge.java`,
`validatePermissions()`:

```java
if (!PermissionHelper.hasDefinedPermissions(getContext(), permStrings)) {
    StringBuilder builder = new StringBuilder();
    builder.append("Missing the following permissions in AndroidManifest.xml:\n");
    String[] missing = PermissionHelper.getUndefinedPermissions(getContext(), permStrings);
    ...
    savedCall.reject(builder.toString());
    return false;
}
```

`PermissionHelper.hasDefinedPermissions` lee los permisos del **manifest
EFECTIVO del APK instalado** (`PackageManager.GET_PERMISSIONS`). Acá está el
detalle:

- `GalleryPlugin` declara dos aliases: `mediaLibrary`
  (`READ_MEDIA_IMAGES`, Android 13+) y `storageLegacy`
  (`READ_EXTERNAL_STORAGE`).
- `requestPermissions()` nativo usa `requestAllPermissions()`, que pide **TODOS
  los strings** de la annotation: `[READ_MEDIA_IMAGES, READ_EXTERNAL_STORAGE]`.
- El manifest declara `READ_EXTERNAL_STORAGE` con `android:maxSdkVersion="32"`.
  En un device **API 33+**, ese permiso NO existe en el manifest efectivo del
  APK → `hasDefinedPermissions` devuelve `false` → Capacitor **rechaza el call
  completo** con el mensaje técnico, aunque el usuario haya concedido
  `READ_MEDIA_IMAGES`.
- En JS, el catch de `requestAccess()` cae en `permission.set('denied')` +
  `error.set(msg)` → pantalla de candado con el texto crudo en inglés.
- Si el usuario va a settings y otorga, **nada re-evalúa la vista al volver al
  primer plano** (no hay listener de `appStateChange`): el estado sigue en
  `denied` y el error sigue visible. El segundo tap de "Dar permisos" entra por
  `mediaPermissionGranted()` = true → `checkPermissions()` → carga la galería.
  Por eso "recién al volver a tocar el botón se abre".

Resumen: **el manifest está correcto**; el bug es que el plugin pide un permiso
que no aplica según API level, y el JS no reacciona al volver al primer plano.

### Plan de cambios

#### 1. Kotlin — `android/app/src/main/java/com/mudo/app/gallery/GalleryPlugin.kt`

Pedir **solo el alias que aplica según el API level**, en vez de todos:

```kotlin
@PluginMethod
override fun requestPermissions(call: PluginCall) {
    if (!mediaPermissionGranted()) {
        val alias = if (Build.VERSION.SDK_INT >= API_LEVEL_33) {
            "mediaLibrary"
        } else {
            "storageLegacy"
        }
        requestPermissionForAlias(alias, call, "permissionsCallback")
    } else {
        checkPermissions(call)
    }
}
```

Con esto, el `validatePermissions` de Capacitor solo valida el permiso que
existe en el manifest efectivo del device y el request nunca se rechaza.

#### 2. JS — `src/app/features/images/components/image-uploader/image-uploader.ts`

- **Re-check al volver al primer plano** (mismo patrón que ya usa
  `update-checker.service.ts`: `document.visibilitychange` +
  `App.addListener('appStateChange')` marcando `isActive`). Al detectar que la
  app vuelve a primer plano, si el estado actual es `denied`, re-ejecutar
  `ensureAccess()` → si el usuario ya otorgó en settings, se desbloquea solo.
- **Limpiar el error al volver a intentar**: en `requestAccess()`, `error.set(null)`
  antes del `requestPermissions()`; y al pasar a `granted`, `error.set(null)`.
- **Nunca mostrar mensajes crudos del puente**: en `gallery.service.ts` el
  `mapError` default expone `capacitorError.message` tal cual. Para errores de
  permisos sin `code` (como éste, que llega como `unknown`), mapear a un mensaje
  user-friendly del tipo `accessDenied`. Alternativa: detectar el mensaje
  `Missing the following permissions` → traducir a "Necesitás dar permiso para
  leer la galería" (aunque con el fix 1.1 no debería volver a pasar).

#### 3. (Opcional, mejora de UX) — deny permanente "Don't ask again"

La primera negación deja `denied`; el botón "Dar permisos" vuelve a disparar el
diálogo nativo pero Android ya no lo muestra de nuevo (queda en deny
permanente). Mejora: si `checkPermissions()` devuelve `denied` (no `prompt`),
mandar directo a settings. OJO: **no existe `App.openSettings()`** en
`@capacitor/app` 8.1.1 (ni `AppLauncher.openSettings()`) — verificado en
node_modules y en el README oficial. Requeriría un custom plugin Android con
`Settings.ACTION_APPLICATION_DETAILS_SETTINGS`. Se deja anotado como
seguimiento porque no se quiere ampliar el alcance de este fix.

### Criterios de aceptación

- Primera instalación, negar el diálogo → pantalla de candado con mensaje
  amigable, **sin** el texto `missing the following permissions`.
- Otorgar desde settings y volver → la galería se desbloquea sola (sin tocar el
  botón).
- Otorgar en el diálogo nativo → carga directa.
- Android < 13 (storageLegacy) sigue funcionando igual.

---

## Fix 2 — El orden z (profundidad) no se persiste al salir y volver

### Síntoma

Con 2 fotos (A y B), al arrastrar una y dejarla **debajo** de la otra, al salir
del álbum y volver a entrar la segunda vuelve a quedar **encima**. Pareciera
relacionado con el orden en que están en la galería.

### Causa raíz (confirmada)

En `album-detail.ts`:

- `onDragStarted()` sube un `z-index` **transitorio** al elemento vía
  `Renderer2` (solo DOM, nunca se persiste).
- `onDragEnded()` persiste el order **por índice del array**:

```ts
this.imageService.updateOrder(
  this.stickers().map((s, i) => ({ id: s.id, order: i })),
);
```

Pero el array `stickers()` **NUNCA se reordena** durante el drag. El `updateOrder`
siempre persiste el mismo mapeo `[A→0, B→1]` → la base no cambia.

Al recargar, `getByAlbum()` ordena por `order` → el DOM queda en el orden de
inserción → la última foto del array (mayor `order`) se pinta **encima**. El
apilamiento visual logrado con el drag (que dependía del z-index transitorio)
se pierde.

**Bug latente adicional** — `local-image.repository.ts` /
`getLastByAlbum()` usa `.last()` sobre el índice simple `albumId`, no sobre el
compuesto `[albumId+order]`:

```ts
async getLastByAlbum(albumId: string): Promise<Image | undefined> {
  return this.db.images.where('albumId').equals(albumId).last();
}
```

`.last()` recorre el índice `albumId` (todos los registros con la misma key) y
devuelve el último por orden de la primary key (id UUID aleatorio) — **NO el de
mayor `order`**. Cuando se reordene un álbum (orders 0..n-1) y se agregue una
foto nueva, el `order = last + 1` puede **colisionar** con un order existente y
romper el apilamiento. El fix del reorden expone este bug, hay que corregirlo
juntos.

### Plan de cambios

#### 1. `src/app/features/albums/components/album-detail/album-detail.ts`

En `onDragEnded()`, además de actualizar x/y, **reordenar el array moviendo el
sticker arrastrado al final** (traer al frente — el mismo comportamiento que ya
tiene el drag hoy con el z-index transitorio, pero persistido):

```ts
this.stickers.update((current) => {
  const without = current.filter((s) => s.id !== sticker.id);
  return [...without, { ...sticker, x, y }];
});
// Persistir posición + order NUEVO (índice del array ya reordenado)
this.imageService.updatePosition(sticker.id, { x, y });
this.imageService.updateOrder(
  this.stickers().map((s, i) => ({ id: s.id, order: i })),
);
```

Con esto, el `order` guardado refleja el orden visual real: el último arrastrado
queda arriba y eso persiste. El `z-index` transitorio de `onDragStarted()`
deja de ser necesario para la lógica de orden (se puede conservar como detalle
de drag o eliminarse).

Nota de diseño: "arrastrar = traer al frente" es el comportamiento estándar de
los editores y es lo que ya ocurre visualmente hoy. Si más adelante se quiere
control fino de profundidad (enviar atrás / traer al frente desde el menú
contextual), es una feature aparte (requiere campo `zIndex` en el modelo +
migración de schema Dexie). Fuera de alcance de este fix.

#### 2. `src/app/core/repositories/images/local-image.repository.ts`

Corregir `getLastByAlbum` para que devuelva el de mayor `order`:

```ts
async getLastByAlbum(albumId: string): Promise<Image | undefined> {
  const images = await this.db.images
    .where('albumId')
    .equals(albumId)
    .sortBy('order');
  return images.at(-1);
}
```

### Tests a actualizar

- `album-detail.spec.ts`:
  - `onDragEnded persiste el order por índice del array (sin reordenar)` —
    cambia la expectativa: ahora **sí reordena** (el arrastrado al final).
  - `onDragStarted setea z-index sin reordenar` — verificar si el z-index
    transitorio se mantiene o se elimina.
- `local-image.repository.spec.ts`: agregar caso de `getLastByAlbum` con
  imágenes desordenadas → devuelve la de mayor `order` (hoy `.last()` fallaría).
- `image.service.spec.ts`: el caso "should continue the order sequence from the
  last image" queda cubierto por el fix del repo.

### Criterios de aceptación

- Foto A y B: arrastrar A para que quede encima de B → salir y volver → **A
  sigue encima**.
- Arrastrar B encima de A → salir y volver → B sigue encima.
- Después de reordenar, agregar una foto nueva → queda arriba de todo y **ningún
  order colisiona** (no puede quedar oculta detrás de otra).
- Suite de tests verde (`npm test`).

---

## Fix 3 — Back del picker con permiso denegado termina en el detail vacío

### Síntoma

```
album-list → /albums/:id/upload (picker pide permiso) → denegar → candado
→ volver → album-detail vacío mostrando "Agregar imágenes"
```

Flujo esperado: al **volver** desde la pantalla de permisos con acceso denegado,
el usuario debería terminar en el **album-list**, no en el detail vacío que no
puede llenar (callejón sin salida: el único camino es volver a tocar
"Agregar imágenes" y repetir el pedido de permiso).

### Causa raíz (confirmada)

- El picker (`image-uploader`) llega desde `/albums/:id` (detail vacío con CTA
  "Agregar imágenes"). Historial: `/albums → /albums/:id → /albums/:id/upload`.
- Con el permiso denegado, el botón "←" (`BackButton`) llama
  `NavigationService.back()`, que con historial interno usa `location.back()` →
  vuelve a `/albums/:id` (el detail vacío).
- En deep links/refresh, la jerarquía del `NavigationService` (`data.backTo:
  '/albums/:id'` en la ruta upload) resuelve el mismo destino.
- El `ImageUploader` no distingue el destino del back según su estado (`denied`
  vs `granted`): siempre vuelve al detail.
- No hay handler del botón físico de Android (`App.addListener('backButton')`)
  en el proyecto: el gesto físico también cae al historial → mismo destino.

### Decisión de producto (validada con el usuario)

Con permiso **denegado**, el back del picker va al **album-list** (home). Con
permiso concedido el back sigue como hoy (vuelve al detail). Simple y
predecible; si más adelante se quiere matizar (p.ej. álbum con fotos sí vuelve
al detail), es ajuste aparte.

### Plan de cambios

#### 1. `src/app/shared/components/back-button/back-button.ts`

Delegar el back al padre cuando la pantalla lo necesite (output opcional,
compatibilidad total: sin handler sigue con `navigation.back()`):

```ts
@Output() readonly back = new EventEmitter<void>();

protected goBack(): void {
  this.back.emit();
  // Si nadie escuchó, comportamiento por defecto
  if (this.back.observers.length === 0) {
    this.navigation.back();
  }
}
```

#### 2. `src/app/core/services/navigation.service.ts`

Método explícito para ir a la lista (mismo patrón que `toAlbumDetail`):

```ts
/** Navega a la lista de álbumes reemplazando la pantalla transitiva actual */
toAlbumList(): void {
  this.router.navigateByUrl('/albums', { replaceUrl: true });
}
```

#### 3. `src/app/features/images/components/image-uploader/image-uploader.{ts,html}`

En el template, delegar el back:

```html
<app-back-button (back)="onBack()" />
```

Y en la clase:

```ts
onBack(): void {
  if (this.permission() === 'denied') {
    // Canceló el flujo: reemplaza el picker por la lista (historial limpio)
    this.navigation.toAlbumList();
  } else {
    this.navigation.back();
  }
}
```

`save()` sigue con `navigation.back()` (tras guardar, el detail ya tiene
fotos → volver ahí sigue siendo correcto).

#### 4. Botón físico de Android — `image-uploader.ts` (PARTE del scope)

El gesto físico de Android hace `history.back()` sin pasar por nuestro handler.
Sin este punto el fix queda A MEDIAS: el botón "←" iría bien, pero el gesto
físico seguiría cayendo al historial y reproduciendo el bug. Registrar un
listener de Capacitor en el picker que aplique la misma regla:

```ts
ngOnInit(): void {
  // ...existente
  this.backButtonListener = App.addListener('backButton', () => this.onBack());
}

ngOnDestroy(): void {
  // ...existente
  void this.backButtonListener?.then((h) => h.remove());
}
```

Ojo con el ciclo de vida: el listener se registra en `ngOnInit` y **se remueve
en `ngOnDestroy`** (`void this.backButtonListener?.then((h) => h.remove())`). Si
queda colgado al salir del picker, el gesto físico va a seguir ejecutando
`onBack()` sobre una pantalla que ya no existe. Es el mismo patrón de registro +
cleanup que ya usa `update-checker.service.ts` con
`App.addListener('appStateChange')` — terreno conocido del repo.

Con esto el gesto físico y el botón "←" se comportan igual y el fix queda
cerrado por los dos caminos de navegación.

### Tests

- `image-uploader.spec.ts`: con `permission() === 'denied'`, `onBack()` navega
  a `/albums`; con `granted`, delega a `navigation.back()`.
- `navigation.service.spec.ts`: caso para `toAlbumList()` (navigateByUrl
  `/albums` con `replaceUrl: true`).
- `back-button.spec.ts`: no existe hoy — opcional crear uno para el output
  (sin handler → `navigation.back()`; con handler → solo el evento).

### Criterios de aceptación

- album-list → álbum vacío → agregar → denegar → volver (botón "←" y gesto
  físico) → **album-list**.
- Con permiso concedido, volver sin guardar → **album-detail** (como hoy).
- Tras guardar fotos (save), volver → **album-detail** con las fotos (como hoy).
- Deep link directo a `/albums/:id/upload` + denegar + volver → album-list.

---

## Alcance / fuera de scope

| Item | Estado |
| ---- | ------ |
| El manifest (`AndroidManifest.xml`) | correcto, no se toca |
| Agregar campo `zIndex` + migración Dexie | fuera de scope (feature futura) |
| `App.openSettings()` para deny permanente | opcional, decidir |
| Re-check al primer plano | incluido en Fix 1 |
| Corrección `getLastByAlbum` | incluido en Fix 2 (bug latente) |
| Handler botón físico Android (`backButton`) en el picker | incluido en Fix 3 (obligatorio) |
| Matizar back según álbum tenga fotos | fuera de scope (decisión: denied → lista siempre) |