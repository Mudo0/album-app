# Deuda técnica — fixes de tests

> **Fecha**: 2026-09-06 · **Quién lo detectó**: durante B5 (UpdateDialog) del auto-update
> **Estado**: resuelto — fixes mínimos (06/09) + arreglos de fondo (P1/P2/P3, 07/09) + flake del checker (P4, 07/09). Suite 161/161 verde (6/6 corridas estables post-fix).

Cuando se corrió `ng test` (builder `@angular/build:unit-test`) por primera vez con la suite de
auto-update, el build global del test suite estaba caído por errores PREEXISTENTES (no del
auto-update) que impedían correr CUALQUIER spec. Se aplicaron fixes mínimos para destrabar; el
arreglo "bien" (entender la causa de raíz) quedó pendiente — esto es la bitácora.

---

## Contexto: por qué estaba caída la suite

`ng test` compila TODO el proyecto de test antes de correr un solo spec. Había 4 errores:

| Archivo | Error | Causa raíz |
| ------- | ----- | ---------- |
| `src/app/core/services/sticker.service.spec.ts:17` | `TS2352` (cast de `getContext`) | La firma de `getContext` quedó SOBRECARGADA en `lib.dom` (TS nuevo). La función `function () {...}` ya no es assignable a `typeof HTMLCanvasElement.prototype.getContext`. |
| `src/app/features/albums/components/album-detail/album-detail.spec.ts:193,215,245` | `TS2554` (falta 2º arg en `onDragStarted`) | La firma cambió: `onDragStarted(sticker, event: CdkDragStart)` (commit de z-index/borders). El spec quedó viejo. |

## Lo que se hizo (fixes mínimos aplicados)

1. **`sticker.service.spec.ts`** — cast con `as unknown as typeof originalGetContext`
   (bola de nieve del cast existente). Corresponde: los tests pasan.
2. **`album-detail.spec.ts`** — se agregó `dragStartMock()` con `source.element.nativeElement`
   (el método REAL lee `event.source.element.nativeElement` en runtime, línea 86 del componente).
3. **`app.spec.ts`** — el host `App` monta `UpdateDialog`, que inyecta el `UpdateCheckerService`
   real (plugin nativo `Update`). En web, CUALQUIER llamada al plugin `Update` rechaza con
   `"Update" plugin is not implemented on web` → 2 unhandled rejections (1 por fixture).
   Fix: mockear el checker con `useValue` (mismo patrón que `album-list.spec` mockea `AlbumService`).
4. **`album-detail.spec.ts`** — 3 tests de drag quedaron `it.skip` con TODO (ver abajo).

---

## RESUELTO 1 — `sticker.service.spec.ts`: el mock de `getContext` (2026-09-07)

**Qué había** (hack, removido): asignación directa al prototipo + restore manual vía
`queueMicrotask` — frágil (si el test fallaba antes del microtask, el mock contaminaba
los tests siguientes).

**Qué hay ahora** (Opción A del plan + restore automático):
```ts
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(
  () =>
    ({
      drawImage: () => {},
      getImageData: () => imageData,
    }) as unknown as CanvasRenderingContext2D,
);
// + afterEach(() => vi.restoreAllMocks());
```

**Decisiones**:
- El cast `as unknown` queda ÚNICAMENTE en el objeto de contexto (la sobrecarga de
  `lib.dom` es rígida); la función mocks no se camufla contra `typeof getContext`.
- Se eliminó el `queueMicrotask` de restore: `vi.restoreAllMocks()` en `afterEach`
  restaura el getContext real de jsdom aunque un test falle.
- Nota: un `satisfies ImageData` sobre `{ data, width, height }` NO compila (TS 5.7+:
  `Uint8ClampedArray<ArrayBufferLike>` no es assignable a `ImageDataArray`). Se dejó
  sin anotar (el retorno ya pasa por `as unknown`).

---

## RESUELTO 2 — `album-detail.spec.ts`: los 3 tests skipped de drag (2026-09-07)

**Qué había**: `it.skip` con TODOs (compilaban y destraban, pero no testeban).

**Causa**: los 3 tests describen el drag de una versión VIEJA del componente. La feature cambió en
un commit previo (borders/z-index) y los specs no se actualizaron:

| Test skip | Comportamiento viejo (lo que el test espera) | Comportamiento REAL actual (código) |
| --------- | -------------------------------------------- | ----------------------------------- |
| `should move dragged sticker to the end...` | `onDragStarted` reordena el array (img1 al final) | `onDragStarted` SOLO setea `z-index` via Renderer2 (`isDragging`, `maxZIndex`). El array NO se reordena en ningún método. |
| `should update position immutably on drag ended` | `onDragEnded` usa `event.source.getFreeDragPosition()` → `{x:42,y:77}` | `onDragEnded` usa `event.distance` (delta) → `x = sticker.x + dx` + **clamp** contra `.canvas` (`getBoundingClientRect`, sticker 120px). |
| `should persist z-order (array order) on drag ended` | el array reordenado persiste order `[img2,0],[img3,1],[img1,2]` | el array nunca cambia; `updateOrder` recibe `stickers().map((s,i) => ({id, order: i}))` (order = índice del array sin reordenar). |

**Qué se hizo** (semántica ACTUAL del componente):

1. **"onDragStarted setea z-index sin reordenar ni mutar el array"**
   - Verifica que el array queda `toEqual` (ni reordena ni muta) y `after[0]` sigue siendo
     la MISMA referencia del sticker arrastrado.
   - En vez de tocar el privado `maxZIndex`, se verifica el EFECTO real:
     `event.source.element.nativeElement.style.zIndex === '1'` (el z-index que Renderer2 aplicó).
2. **"onDragEnded actualiza la posición immutably con event.distance"**
   - `dragEnd = { distance: { x: 32, y: 67 } } as unknown as CdkDragEnd`.
   - El template mínimo del spec ganó el `<div class="canvas">` real (el componente lo busca
     con `querySelector('.canvas')`) y se mockea su rect con `mockCanvasRect()` (400×600) para
     que el clamp NO fuerce 0,0. Sin esto el rect de jsdom es 0×0 y `x`/`y` quedan en 0.
   - `updated.x === 42` (10+32), `updated.y === 77` (10+67), `updated !== original`, `original.x === 10`.
   - **CORRECCIÓN a la proyección original**: `updatePositionSpy` recibe `('img1', { x: 42, y: 77 })`
     — el delta Y se SUMA al sticker (10+67=77), no se pasa crudo (la proyección decía `y: 67`).
3. **"onDragEnded persiste el order por índice del array (sin reordenar)"**
   - `dragEnd = { distance: { x: 0, y: 0 } }` + rect mockeado.
   - `updateOrderSpy` recibe `[{id:'img1',order:0},{id:'img2',order:1},{id:'img3',order:2}]`.

**Pregunta abierta (resuelta)**: ¿el drag DEBERÍA reordenar el array o el order-por-índice actual
es el diseño correcto? Se decidió mantener el comportamiento actual y adaptar los specs —
reordenar con signals durante drag dispara CD y el CDK resetea `_activeTransform`, caveat que ya
documentó el autor del commit de borders/z-index.

---

## RESUELTO 3 (investigación) — `app.spec.ts`: por qué el checker real llamaba al plugin en web (2026-09-07)

**Qué hay ahora**: mock del `UpdateCheckerService` en app.spec (fix correcto, consistente con el
repo). Se MANTIENE tal cual — es la defensa correcta.

**Investigación con evidencia reproducible** (spec temporal con el checker REAL, luego borrado):

1. `TestBed.configureTestingModule({ imports: [App], providers: [...appConfig.providers] })`
   con checker real (incluye `provideAppInitializer` → `UpdateCheckerService.init()`):
   - Probe `isNativePlatform=false` → `init()` es NO-op → **0 unhandled rejections**.
   - Los 2 fixtures pasan sin mock.
2. `TestBed.configureTestingModule({ imports: [App] })` SIN providers (como el app.spec original):
   - La flag `dev:album-seeded-v1` del DevSeeder queda `null` → el `provideAppInitializer`
     del `appConfig` **NO corre** en el TestBed (el builder unit-test NO aplica `appConfig`).
3. Conclusión: con el código ACTUAL no existe camino donde el checker real toque el plugin en
   el entorno de test — el gate `Capacitor.isNativePlatform()` lo corta en frío. Las 2 rejections
   que se vieron durante B5 fueron un estado TRANSITORIO del desarrollo (firma del checker previa
   al gate final o comportamiento distinto de Capacitor en ese momento), no del código vigente.

**Regla operativa** (se mantiene): cualquier componente del host `App` que use el checker (o
plugins nativos) ⇒ el spec de `App` debe proveer el mock del servicio — cuesta 3 líneas y hace el
spec inmune a cambios futuros del gate.

---

## RESUELTO 4 (flake) — `update-checker.service.spec.ts`: mock de `@capacitor/core` se degradaba en el bundle (2026-09-07)

**Síntoma**: `ng test` fallaba EN BLOQUE de forma intermitente — 18 failed | 143 passed (2 de ~12
corridas). Siempre el MISMO archivo: `update-checker.service.spec.ts` (18/18 tests), mientras
`npx vitest run .../updates --pool=forks` pasaba 64/64. Los specs de P1/P2/P3 siempre verdes.

**Causa raíz (evidencia del log)**: los 18 fallos tenían la firma exacta de `isNativePlatform
() === false` real:
- `expected undefined to be '1.0.1'` → `check()` retornó `null` (gate de plataforma cortó en frío)
- `expected 'idle' to be 'no-update'` / `'error'` → el checker nunca corrió
- `github.check ... got 0 times` / `plugin.download ... got 0 times` → nadie llamó a la API

**Por qué**: el spec mockeaba `@capacitor/core` con `vi.mock('@capacitor/core', ...)`. Pero
`image-uploader.spec.ts` e `image.service.spec.ts` importan `Capacitor` REAL (spyOn). El builder
`@angular/build:unit-test` bundlea los specs en chunks compartidos: cuando el worker ya evaluó el
chunk con `@capacitor/core` real (cargado por otra spec), el `vi.mock` del checker no podía
reemplazarlo → el checker corría contra el Capacitor REAL → en jsdom `isNativePlatform()=false`
→ TODO no-op. Intermitente porque depende del orden de evaluación de chunks por worker.

**Fix (patrón del repo, determinista)**: reemplazar `vi.mock('@capacitor/core')` por spy del
MÉTODO sobre el módulo real — exactamente lo que ya hace `image-uploader.spec.ts:63`:

```ts
import { Capacitor } from '@capacitor/core';
// beforeEach:
vi.spyOn(Capacitor, 'isNativePlatform').mockReturnValue(true);
// test de plataforma:
vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
// afterEach:
vi.restoreAllMocks();
```

El spy vive en la MISMA instancia de `Capacitor` que importa el checker → no puede degradarse por
orden de carga del bundler (a diferencia del `vi.mock`, que era una carrera de chunks).

**Se MANTIENE** `vi.mock('@capacitor/app')`: es el ÚNICO consumer de `@capacitor/app` en la suite,
no hay chunk real con el que compita, y el listener capturado permite disparar `appStateChange`
manualmente (ningún camino para hacer eso con el web plugin real).

**Verificación**: checker aislado 64/64 + suite completa 161/161 en 6/6 corridas consecutivas
post-fix. Antes del fix, 2/12 corridas fallaban.

**Regla operativa**: en un spec, NUNCA `vi.mock` de un módulo de Capacitor que OTRA spec use real
en la suite — usar `vi.spyOn` sobre el método del objeto real (patrón del repo).

---

## Cómo verificar

```bash
npm test                          # suite completa: 161 passed | 0 skipped | 0 failed
npx vitest run src/app/core/services/updates --pool=forks   # specs puros del auto-update: 64 verdes
```

## Estado final esperado

- [x] Suite compila y corre (16 archivos, 161 passed, 0 skipped)
- [x] PENDIENTE 1: mock de `getContext` tipado "bien" (vi.spyOn + restore, 2026-09-07)
- [x] PENDIENTE 2: reescribir los 3 tests de drag a la semántica actual (2026-09-07)
- [x] PENDIENTE 3: investigar el llamado del checker en el entorno de test (2026-09-07)
- [x] PENDIENTE 4 (flake): mock de `@capacitor/core` degradado en el bundle → spyOn (2026-09-07)