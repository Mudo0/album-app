# Cleaning Audit – Fase 2
Fecha: 2026-10-16
Rama: `chore/cleaning-audit-phase2`
Doc de origen: `docs/CLEANING_AUDIT_2026-10-06.md` (secciones 4, 5, 6)

## 0) Resumen

Se recorrió el resto del checklist. **La mayor parte ya estaba limpia**; las
acciones reales fueron OnPush en el componente root y limpieza de variables/params
sin usar (con flags de compilador para prevenir regresión).

Verificación: `tsc` 0 errores · 193/193 tests OK.

## 1) Resultado por ítem

| Ítem (sección) | Estado | Detalle |
|---|---|---|
| OnPush (5) | **Acción** | Faltaba solo el root `app.ts`; era 8/9 componentes, ahora 9/9 |
| Deps sin uso (1) | OK | Ninguna. `@angular/cdk` en uso (scrolling, drag-drop, collections); `tslib` la requiere `importHelpers`; el resto referenciado |
| Imports circulares (4) | OK | No hay. `core` no importa `features` (dirección única) |
| Barrels `index.ts` (4) | N/A | No existen en el repo |
| Rutas lazy (5) | OK | Todas usan `loadComponent` |
| `track` en `@for` (5) | OK | Los 3 loops lo tienen |
| Assets sin uso (1) | OK | Solo `public/favicon.ico`, referenciado en `index.html` |
| Android temporales (6) | OK | `build/`, `.gradle/`, `local.properties`, `.idea` ignorados y no trackeados; todos los tracked son fuente |
| dist/ / .angular/cache / coverage (6) | OK | No trackeados |
| Variables/params sin usar (4) | **Acción** | 6 hallazgos, removidos (ver §2) |
| Bundles grandes (5) | **Medido** | Ver §4 — sin oportunidades de lazy evidentes |

## 2) Cambios aplicados

Código muerto removido (detectado con `noUnusedLocals` + `noUnusedParameters`):

- `core/services/clipboard.service.ts` — import `type ClipboardPluginInterface` sin usar.
- `core/services/updates/update-checker.service.ts` — `inject` importado sin usar.
- `features/albums/.../album-detail.ts` — param `sticker` sin usar en `onDragStarted`
  (se quitó del método y del binding del template); locales `canvasHeight` / `canvasWidth` sin usar.
- `features/albums/.../album-detail.spec.ts` — ajustado el call a `onDragStarted(event)`.
- `features/updates/update-dialog.spec.ts` — tipo `CheckState` importado sin usar.

Mejoras:

- `app.ts` — `ChangeDetectionStrategy.OnPush` en el componente root.
- `tsconfig.json` — `noUnusedLocals: true` y `noUnusedParameters: true` (previene regresión).

## 3) Evidencia

```
npx tsc -p tsconfig.app.json  --noEmit   # 0 errores
npx tsc -p tsconfig.spec.json --noEmit   # 0 errores
npm test                                  # 18 files, 193 tests passed
```

## 4) Medición de bundle

`npm run build` (producción) → OK, 22.9s, sin warnings de budget.

**Initial: 394.94 kB raw / 113.19 kB transfer** (budget: warn 500kB, error 1MB → pasa con margen).

| Chunk (initial) | Raw | Transfer | Contenido |
|---|---|---|---|
| chunk-XY3HBN2E | 155.8 kB | 46.2 kB | Runtime Angular core (`ng-template`, `__ngContext__`) |
| main | 110.6 kB | 34.0 kB | Bootstrap de la app + Dexie + rxjs |
| chunk-UXRXXLEW | 108.4 kB | 28.0 kB | Angular (common/router) + rxjs |
| chunk-TDDKBJBY | 7.7 kB | 2.9 kB | @capacitor |

**Lazy chunks** (features ya diferidas — bien):

| Chunk | Raw | Transfer |
|---|---|---|
| album-detail | 64.1 kB | 16.9 kB |
| shared lazy (CDK) | 28.0 kB | 7.6 kB |
| album-form | 25.4 kB | 6.6 kB |
| image-uploader | 12.6 kB | 4.2 kB |
| album-list | 6.6 kB | 2.2 kB |
| permission-required | 5.1 kB | 1.9 kB |
| image-viewer | 0.4 kB | 0.4 kB |

**Conclusiones**
- Las features ya están todas lazy (`loadComponent`); `@angular/cdk` (drag-drop, scrolling) cae **solo en chunks lazy**, no en el initial.
- El initial está dominado por el **runtime de Angular** (inevitable) + **Dexie** (necesario al bootstrap: `DevSeederService` y guards usan los repositorios vía `provideAppInitializer`).
- **No hay oportunidad de lazy de bajo costo.** Diferir Dexie o el `update-dialog` daría una ganancia marginal a cambio de complejidad arquitectónica (no se hace).
- Budgets de producción ya configurados (`angular.json`): initial 500kB/1MB, anyComponentStyle 4kB/8kB. Pasan con margen.
