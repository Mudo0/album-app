# Spec: Auto-update in-app desde GitHub Releases

> Estado: **validado — listo para implementar**
> Alcance: Android (Capacitor 8). En web/desktop la feature es **no-op silencioso** (a futuro se adapta a Tauri).

---

## 1. Contexto

La app ya tiene un pipeline de releases completo:

- `scripts/release.js` calcula la versión (`vX.Y.Z[-etapa.N]`, etapas `alpha < beta < rc < stable`) y crea el tag `vX.Y.Z[-etapa.N]`.
- `.github/workflows/build-apk.yml` compila el APK en cada tag `v*` y crea un GitHub Release con el APK adjunto (`make_latest: true` hoy en **todos** los releases, sin distinción).
- La versión empaquetada en la app viene de `src/environments/version.ts` (autogenerado por `scripts/generate-version.js`), que es la fuente de verdad también para `versionCode`/`versionName` en `android/app/build.gradle`.

Falta la mitad cliente: que la app detecte, descargue e instale las actualizaciones.

## 2. Modelo de canales y versiones

### 2.1 Convención de versiones (recién del proyecto, NO semver puro)

```
X.Y.Z[-etapa.N]     ej: 1.0.0, 1.0.0-alpha.2, 1.0.0-rc.1
```

Orden de etapas para la **misma base** `X.Y.Z`: `stable (sin sufijo) > rc > beta > alpha`.
El tag de GitHub viene prefijado con `v` (`v1.0.0-alpha.2`) → **siempre normalizar quitando la `v` inicial**.

Comparación (función pura, testeable):

1. Comparar `X.Y.Z`. Si difieren → gana el mayor.
2. Base igual → gana la etapa: `null (stable) > rc > beta > alpha`.
3. Misma etapa → gana el número de etapa `N`.

### 2.2 Canales — derivados de la versión LOCAL, no de configuración

| Canal | Versión local | Qué release remoto busca | Qué asset baja |
|---|---|---|---|
| **dev** | prerelease (`alpha`/`beta`/`rc`) | El release **`dev-v*` más reciente** (solo builds del workflow dev) | `album-app-dev.apk` |
| **release** | estable (sin sufijo) | El **más reciente por fecha** entre los **no-prerelease** | `album-app.apk` |

La API de GitHub lista `/releases` en orden de publicación desc → el **primer** elemento que cumple el filtro del canal ES el más reciente; no hay que ordenar. Los releases dev (tag `dev-v*` generados por el workflow C3) viven en el mismo listado que los oficiales (`v*`).

**El canal dev NO promociona a estable (intencional — decisión de producto)**: la app dev es exclusivamente para debuggear; si está instalada, solo le interesan los builds `dev-v*`. Un release oficial estable publicado después del último build dev NO se le ofrece. Para pasar al canal estable se instala el APK estable a mano.

**Anti-falso-positivo en ambos canales**:
- App dev (`0.0.0-alpha.5`) + solo release estable más nuevo en el pool → NO ofrece (el canal dev ignora `v*`).
- App estable (`1.0.0`) + alpha más nuevo en el pool → NO ofrece (el canal release ignora prereleases; además los builds dev son `dev-v*`, prerelease).
- App dev (`0.0.0-alpha.5`) + `dev-v0.0.0-alpha.6` publicado → ofrece (6 > 5).

### 2.3 Assets por canal (decisión tomada: 1 APK por release, según su canal)

En lugar de dos assets por release (que exige firmas compatibles y complica el naming), **cada release publica UN solo APK, el de su canal**:

| Tag del release | Asset canónico (nombre fijo) | Asset por versión (se mantiene) |
|---|---|---|
| estable (`v1.0.0`) | `album-app.apk` | `album-app-v1.0.0.apk` |
| prerelease (`v1.0.0-beta.1`) | `album-app-dev.apk` | `album-app-beta.1.apk` |

La app elige el asset según la etapa del **release remoto elegido** (no del local):

- release elegido estable → busca `album-app.apk`
- release elegido prerelease → busca `album-app-dev.apk`
- Fallback: si el nombre exacto no está, tomar el primer `*.apk` del release.

**Por qué NO dos APKs (dev + release) en el mismo release**: si se firman distinto (debug vs keystore real), el upgrade dev→stable falla con `INSTALL_FAILED_UPDATE_INCOMPATIBLE` (y obliga a desinstalar, perdiendo datos). La vía simple: el CI firma **todos** los canales con el mismo keystore cuando los secrets existen (ya es el comportamiento actual). Eso hace la transición alpha→beta→rc→stable transparente.

## 3. Decisiones de diseño

| # | Decisión | Razón |
|---|---|---|
| **D1** | Un solo endpoint `GET /releases?per_page=100`, filtro por canal en la app. NO usar `/releases/latest`. Canal dev → primer release con tag `dev-v*`. Canal estable → primer release no-prerelease. | El workflow actual marca `make_latest: true` en TODOS los tags → `/latest` puede apuntar a un alpha. El filtrado local no depende del estado mutable de GitHub. Los canales son simétricos: dev ve solo builds `dev-v*` (decisión de producto: la app dev es solo para debug), release ve solo releases oficiales. |
| **D2** | Comparador semver+etapas propio en TS (función pura). No agregar lib semver | La convención del proyecto (etapas) no es semver puro; una lib daría falsos "iguales". Y cero dependencias nuevas. |
| **D3** | Plugin nativo Kotlin `UpdatePlugin` (descarga + instalación). Patrón: `ClipboardPlugin.kt` existente | El WebView no puede lanzar intents de Android. El plugin ya vive en `android/app/src/main/java/com/mudo/app/` y se registra a mano en `MainActivity`. |
| **D4** | Descarga con `DownloadManager` nativo a `getExternalFilesDir`, **completa → recién ahí instalar**. La descarga sobrevive si matás la app | `DownloadManager` corre en el sistema, no en la WebView. Al reabrir, el plugin consulta descargas pendientes/completadas (`resumePending`) y ofrece instalar. |
| **D5** | Instalación: `FileProvider.getUriForFile` + `ACTION_VIEW` + `application/vnd.android.package-archive`, con chequeo previo de `canRequestPackageInstalls()` | Sin ese chequeo, Android 8+ tira `SecurityException` (crashea — justo lo que el AC evita). Si falta, se lanza `ACTION_MANAGE_UNKNOWN_APP_SOURCES`. |
| **D6** | **Re-check al volver a primer plano** (`visibilitychange`). Sin throttle estricto — un request por `resume` es inofensivo (GitHub: 60 req/h). "Más tarde" silencia el diálogo de update por 24h (no el check en sí). Caché en `localStorage` solo para mostrar la UI sin parpadeo de "verificando..." en cold start. | Para el caso de uso dev (probando en celular): el usuario compila en PC → push → workflow publica APK → vuelve a la app en el celular → `visibilitychange` dispara check → detecta nueva versión → diálogo. Un request por `resume` no se acerca al rate-limit. |
| **D7** | Capa de bridge abstraída: `NativeUpdateBridge` (interfaz) + `CapacitorUpdateBridge` (adapter) vía provider (patrón `album-repository.provider`) | Para que el core no se acople a Capacitor y el día de mañana el backend sea Tauri sin tocar la lógica. |
| **D8** | No-op en web/desktop: el checker valida `Capacitor.getPlatform() === 'android'` antes de cualquier llamado | PWA/desktop no tienen instalador. Futuro: Tauri. |
| **D9** | Auto-check en bootstrap (**fire-and-forget**) + re-check silencioso en cada `visibilitychange` (app vuelve de background) | El bootstrap dispara el primer check sin bloquear el render. Al volver de background, se re-ejecuta (un solo request). Para dev: detecta la nueva versión al reabrir la app. Para release: cubre cold starts y re-opens sin spamear. |

**Limitación conocida**: `per_page=100` evalúa hasta 100 releases. Para un repo personal alcanza (el último estable estará en el pool salvo que publiques 100 prereleases seguidas sin estabilizar — aceptado).

## 4. Estructura de archivos propuesta

```
android/app/src/main/java/com/mudo/app/updates/UpdatePlugin.kt     (nuevo — plugin nativo)
android/app/src/main/java/com/mudo/app/MainActivity.java           (editar — registrar plugin)
android/app/src/main/AndroidManifest.xml                           (editar)
android/app/src/main/res/xml/file_paths.xml                        (editar)

src/app/core/services/updates/version.compare.ts                   (nuevo — puro, devuelve comparador)
src/app/core/services/updates/version.compare.spec.ts              (nuevo — tests)
src/app/core/services/updates/github-releases.service.ts           (nuevo — fetch + parseo + selección)
src/app/core/services/updates/github-releases.service.spec.ts      (nuevo — tests)
src/app/core/services/updates/update-checker.service.ts            (nuevo — orquesta check + caché)
src/app/core/services/updates/native-update.bridge.ts              (nuevo — interfaz)
src/app/core/services/updates/capacitor-update.bridge.ts           (nuevo — adapter Capacitor → plugin)
src/app/core/providers/update.provider.ts                          (nuevo — DI, patrón album-repository.provider)
src/app/app.config.ts                                              (editar — registrar provider + auto-check)
src/app/features/updates/update-dialog.ts|html|scss|spec.ts        (nuevo — UI diálogo + progreso)
```

## 5. Tareas de implementación

### FASE A — Android nativo

#### A1. Manifest: permiso + FileProvider paths
**Archivos**: `AndroidManifest.xml`, `res/xml/file_paths.xml`

- Agregar `<uses-permission android:name="android.permission.REQUEST_INSTALL_PACKAGES" />`.
- Agregar al `file_paths.xml` un `<external-files-path name="update_apks" path="." />` (la descarga va a `getExternalFilesDir` → `Android/data/com.mudo.app/files/`).
- El FileProvider existente (authority `${applicationId}.fileprovider`) se reutiliza, no se crea otro.

**AC**: `npx cap sync android` compila; el manifest tiene los 3 permisos (`INTERNET`, `REQUEST_INSTALL_PACKAGES`, media) y el provider cubre `external-files-path`.

#### A2. `UpdatePlugin.kt`
**Archivos**: `android/app/src/main/java/com/mudo/app/updates/UpdatePlugin.kt` (nuevo)

Extiende `Plugin()` siguiendo el patrón de `ClipboardPlugin.kt` (executor propio, `call.resolve/reject`, excepciones atrapadas).

**Métodos JS**:
| Método | Params | Comportamiento |
|---|---|---|
| `download` | `url`, `fileName` | `DownloadManager` → `setDestinationInExternalFilesDir(context, null, fileName)`. Borra un archivo previo con el mismo nombre. Guarda `downloadId` en `SharedPreferences` (sobrevive al cierre). Resuelve con `{ downloadId }`. Arranca polling de progreso (bytes/total) → `notifyListeners("download-progress")`. |
| `install` | `downloadId` (o `fileName`) | Verifica `canRequestPackageInstalls()`. Si false → lanza `ACTION_MANAGE_UNKNOWN_APP_SOURCES` y rejecta con `{ unknownSourcesRequired: true }`. Si true → `FileProvider.getUriForFile(context, "${packageName}.fileprovider", apkFile)` → `ACTION_VIEW` + `setDataAndType(uri, "application/vnd.android.package-archive")` + `FLAG_GRANT_READ_URI_PERMISSION` + `FLAG_ACTIVITY_NEW_TASK`. |
| `resumePending` | — | Consulta `DownloadManager` por los `downloadId`s guardados: si `STATUS_SUCCESSFUL` → emite `download-complete` con `{ fileName }`; si `STATUS_RUNNING` → emite `download-progress`; si `STATUS_FAILED` → emite `download-error` y limpia. |

**Eventos emitidos** (`notifyListeners`): `download-progress` `{ bytes, total }`, `download-complete` `{ fileName }`, `download-error` `{ message }`.

El `BroadcastReceiver` de `DownloadManager.ACTION_DOWNLOAD_COMPLETE` se registra en `load()` y también re-emite `download-complete` cuando la app está viva.

**AC**: instalando el APK dev sobre la app, el flujo completo descarga → instala con el asistente nativo. Matando la app a mitad de descarga y reabriendo, se ofrece instalar (o continúa). Sin el permiso de orígenes desconocidos, abre el settings y no crashea.

#### A3. Registrar el plugin
**Archivos**: `MainActivity.java`

```java
registerPlugin(UpdatePlugin.class);
```

**AC**: `npx cap sync android && ./gradlew assembleDebug` compila y el plugin aparece en `window.Capacitor.Plugins.Update`.

### FASE B — Angular core y UI

#### B1. `version.compare.ts` — parseo y comparación [puro]
**Archivos**: `src/app/core/services/updates/version.compare.ts` + `.spec.ts`

- `parseVersion('v0.0.0-alpha.4')` → `{ major, minor, patch, stage: 'alpha' | 'beta' | 'rc' | null, num }` (normaliza la `v`).
- `parseVersion` también normaliza el prefijo dev: `'dev-v0.0.0-alpha.5'` → `v0.0.0-alpha.5` → `{ 0,0,0,'alpha',5 }` (strip `dev-` antes del strip `v`).
- `compareVersions(a, b)` → `-1 | 0 | 1` según 2.1. `STAGE_ORDER = ['rc', 'beta', 'alpha']`, `null` (stable) gana a todo.
- Casos borde: base distinta gana por X.Y.Z aunque la etapa sea menor (`1.1.0-alpha.1 > 1.0.9-stable`); mismo stage y num igual → iguales.

**AC (tests vitest)**: rejilla de casos → `0.0.0-alpha.4` vs `0.0.0` → menor; `1.0.0` vs `1.0.1-alpha.1` → menor (no empuja alpha a prod); `1.0.0-beta.2` vs `1.0.0-alpha.9` → mayor; `v1.0.0` parsea igual que `1.0.0`; `dev-v0.0.0-alpha.5` parsea igual que `0.0.0-alpha.5`.

#### B2. `github-releases.service.ts` — fetch + parseo + selección
**Archivos**: `src/app/core/services/updates/github-releases.service.ts` + `.spec.ts`

- `GET https://api.github.com/repos/Mudo0/album-app/releases?per_page=100` (constante, sin header de auth).
- Parsear: `tag_name` (normalizado), `published_at`, `draft`, `prerelease`, `assets[]` (`name`, `browser_download_url`), `body`.
- Descartar drafts y releases sin ningún asset `.apk`.
- `selectTarget(releases, local)` según 2.2:
  - canal local estable → primer release cuyo `tag_name` **no** empiece con `dev-` y `prerelease === false`.
  - canal local dev → primer release cuyo `tag_name` **empiece con `dev-`**.
- `selectAsset(release, targetStage)` según 2.3: nombre exacto por canal → fallback primer `.apk`.
- Devuelve `UpdateInfo | null`: `{ version, url, notes, fileName }` — `null` si no hay release candidata o `compareVersion(local, remote) >= 0`.

**AC**: con fixtures de la API (JSON real de GitHub), el checker elige bien el release en las 4 combinaciones (estable/estable-mayor → ofrece; estable + alpha último → no ofrece; dev + build dev nuevo → ofrece; dev + solo estable más nuevo → NO ofrece porque el canal dev ignora `v*`). Si la API responde 403/401/500 o sin red → error propagado como `UpdateCheckError`, sin crash.

#### B3. `update-checker.service.ts` — orquestador + caché
**Archivos**: `src/app/core/services/updates/update-checker.service.ts` + `.spec.ts`

- Lee versión local desde `environments/version`.
- `check(force = false)`: si `Capacitor.getPlatform() !== 'android'` → `null` (no-op, D8). Caché en `localStorage` (`update:check` = `{ ts, result }`): dentro de 24h y sin `force` → devuelve el caché; con "Más tarde" (`dismissUpdate()`) guarda 24h extra con `{ dismissed: true }`.
- Estados en signals: `{ type: 'idle' | 'checking' | 'update-available' | 'no-update' | 'error' }`, y estado de descarga `{ type: 'idle' | 'downloading' | 'ready' | 'error', progress? }`.
- Suscribe desde el constructor a los eventos del bridge (`download-complete` → estado `ready`, incluso con la app recién abierta vía `resumePending()`).
- Re-check en `visibilitychange`: cuando `document.visibilityState === 'visible'`, re-ejecuta `check()` (sin throttle — un request por `resume` es negligible). El `localStorage` solo guarda el último resultado para UI inmediata, no como gate.

**AC (tests)**: con `provideHttpClient` + mocking (patrón de los specs existentes): check con update → `update-available`; sin update → `no-update`; 403 → `error` silencioso y **no** crashea; re-check en `visibilitychange` llama a la API de nuevo (sin throttle).

#### B4. Bridge nativo + provider
**Archivos**: `native-update.bridge.ts`, `capacitor-update.bridge.ts`, `core/providers/update.provider.ts`, `app.config.ts`

- Interfaz `NativeUpdateBridge`: `download(url, fileName)`, `install(fileName)`, `resumePending()`, `addListener(event, cb)` (envuelve `removeListener`).
- `CapacitorUpdateBridge` implementa con `Capacitor.registerPlugin('Update')` + mapeo de eventos.
- Provider factory (patrón `album-repository.provider`): siempre el adapter Capacitor por ahora (el no-op de plataforma vive en el checker, no en el bridge).
- `app.config.ts`: registrar el provider y el auto-check **fire-and-forget** (llamar `check()` sin await en el initializer — D9).

**AC**: la app inicia sin bloqueo, el check corre en background; los eventos del plugin llegan al checker.

#### B5. `UpdateDialog` — UI
**Archivos**: `src/app/features/updates/update-dialog.{ts,html,scss,spec.ts}`

Dos vistas en un solo componente (estados del checker):

1. **"Nueva versión disponible"**: versión remota + `body` (notas) + botones **Actualizar ahora** / **Más tarde**.
2. **Descarga en curso**: spinner + barra de progreso si el plugin da bytes/total (botón deshabilitado; un solo `downloadId` activo).
3. **"Lista para instalar"**: botón **Instalar ahora** → `bridge.install()`; si `unknownSourcesRequired` → mensaje avisando que habilite orígenes desconocidos y botón para reintentar.
4. Error de descarga: mensaje + botón Reintentar.

Render: en `App` (host) vía `@if`/signals — no requiere overlay de CDK ni ruta. Estilos acordes a `app.scss` del proyecto.

**AC (spec)**: con las signals del checker en cada estado, el componente renderiza la vista correcta; el click de "Actualizar ahora" llama al bridge; "Más tarde" llama `dismissUpdate()`.

**Sin botón manual por ahora** — no existe pantalla de Settings en la app (solo albums/images). Cuando aparezca, el `check(true)` ya está listo para ahí.

### FASE C — CI/CD (workflow)

#### C1. `build-apk.yml`: canales correctos
**Archivos**: `.github/workflows/build-apk.yml`

- Detectar si el tag tiene sufijo prerelease (bash: `[[ "${{ github.ref_name }}" =~ -(alpha|beta|rc)\. ]]`).
- Paso "Crear Release":
  - `prerelease: true` solo si es prerelease.
  - `make_latest: true` **solo** si es estable (hoy está en todos — esto también arregla `/releases/latest` para links manuales).
- Paso "Preparar APK": además del nombre por versión, copiar a:
  - estable → `album-app.apk` (comportamiento actual, queda igual)
  - prerelease → `album-app-dev.apk`
- Subir ambos archivos al release (asset por versión + asset canónico del canal).

**AC**: un tag `v0.0.1-alpha.1` genera un release marcado prerelease con `album-app-dev.apk` (y sin `latest`); un tag `v0.0.1` genera release estable con `album-app.apk` y `latest`.

#### C2. (Post-MVP — opcional) Changelog real en el `body`
**Archivos**: `build-apk.yml` (step 12), quizás `release.js`

Hoy el `body` es genérico ("APK para la versión X…"). Para que el diálogo muestre notas útiles: inyectar los commits entre el tag anterior y este (vía API de GitHub en el workflow) o el mensaje de release de `release.js`. **No bloquea** la feature (el diálogo muestra lo que venga).

#### C3. Workflow de dev (`build-dev.yml`) — iteración rápida en el celular
**Archivos**: `.github/workflows/build-dev.yml` (nuevo), `scripts/dev-version.js` (nuevo)

**Objetivo**: cada push a la rama `dev` publica un APK dev nuevo; la app en el celular lo detecta al volver a primer plano y te deja actualizar con un tap. Sin pasar por el flujo completo de release.

- **Trigger**: `on: push: branches: [dev]`. Permisos: `contents: write`. Concurrency: grupo por rama, cancel-in-progress.
- **Pasos** (misma base que `build-apk.yml`): checkout → node/java/npm ci → **generar versión dev** → build Angular → `npx cap sync android` → `chmod +x gradlew` → firma (mismos secrets KEYSTORE_*) → `assembleRelease` → publicar release.
- **Generación de versión dev** (`scripts/dev-version.js`): la versión dev se numera sobre el **último release `dev-v*` publicado** (estado real del repo, no contador del CI):
  1. Lee `package.json` → base `X.Y.Z` y etapa actual (si la versión es estable, fuerza etapa `alpha`).
  2. Consulta el último release `dev-v*` publicado (vía `gh api` con `GH_TOKEN`) y extrae su base y etapa.
  3. Regla de numeración:
     - Último dev con **misma etapa y misma base** → `N = últimoDev.N + 1` (ej: `dev-v0.0.0-beta.1` → `dev-v0.0.0-beta.2`).
     - Sin dev previo, o con **etapa o base distinta** → `N = 1` (ej: al pasar de alpha a beta, la serie dev arranca en `beta.1`).
  4. **Si la consulta falla → el script aborta y el workflow falla, NO publica nada** (sin fallback — ver "Fallas del workflow dev" en sección 6).
  5. Expone la versión como output (`dev-v$VERSION`) y aplica `npm version {v} --no-git-tag-version` + `node scripts/generate-version.js`. El `package.json` modificado NO se commitea (el workspace del runner es descartable); el APK queda con `versionName`/`versionCode` correctos porque `build.gradle` lee el package.json modificado.
- **Publicación** (con `gh` CLI, no softprops — el tag se crea en el paso de versión):
  ```yaml
  - name: Generar versión dev
    id: version
    env:
      GH_TOKEN: ${{ github.token }}
    run: node scripts/dev-version.js   # imprime dev-v0.0.0-beta.2 como output

  - name: Publicar release dev
    env:
      GH_TOKEN: ${{ github.token }}
    run: |
      VERSION="${{ steps.version.outputs.version }}"
      gh release create "$VERSION" \
        --repo "${{ github.repository }}" \
        --title "Dev Build ${VERSION#dev-}" \
        --prerelease \
        --notes "Build automático del push a dev (${{ github.sha }})"
  ```
  El tag `dev-v*` **NO** dispara el workflow principal (`v*` no matchea `dev-v0.0.0-alpha.5`), así que solo existe el release dev.
- **Assets**: `album-app-dev.apk` (canónico) + `album-app-beta.2.apk` (por versión).

**Flujo del usuario (el caso de uso que pediste)**:
```
cambios → git push a dev → build-dev.yml numera "0.0.0-beta.2" (el último dev era beta.1)
  → release dev-v0.0.0-beta.2 publicado
  → abrís la app en el celular (o volvés a primer plano)
  → visibilitychange → check → remota beta.2 > local → diálogo "Nueva versión disponible"
  → Actualizar ahora → descarga → instalar
```

**AC**: cada push a `dev` publica el release `dev-v*` (prerelease, sin `latest`) con numeración semántica por etapa (`alpha.1, alpha.2… beta.1, beta.2…`); la versión remota es siempre mayor que la local anterior (`N+1` sobre el último publicado, o `N=1` al cambiar etapa/base); el tag `dev-v*` no dispara el workflow principal; si la consulta del último dev falla, el workflow falla **sin publicar**.

**Nota de firma**: si los secrets `KEYSTORE_*` están en el repo, el APK dev queda firmado con el MISMO keystore que los releases → se instala sobre la app existente sin desinstalar. Sin secrets, cae a debug signing (el flujo dev sobre una app firmada release falla con `INSTALL_FAILED_UPDATE_INCOMPATIBLE`). Decisión del usuario: perder datos en la transición dev→release no es problema hoy (sin usuarios reales); se revisa antes de la 1.0 estable.

## 6. Casos borde / errores (no-crash garantizado)

| Caso | Comportamiento |
|---|---|
| Sin conexión / DNS falla | `UpdateCheckError` → estado `error` silencioso, sin diálogo, sin crash |
| API 403 (rate limit) o 5xx | Ídem; el caché local sigue sirviendo el último check |
| Versión local ≥ remota | `null` → ningún diálogo |
| Version local mayor (rollback de release) | No ofrece (nunca downgrade) |
| App dev instalada + release oficial estable más nuevo (sin build dev nuevo) | No ofrece — el canal dev solo mira tags `dev-v*` (decisión de producto: dev = debug) |
| App estable instalada + build dev nuevo | No ofrece — el canal release solo mira no-prerelease |
| Release sin asset `.apk` | Se descarta |
| Release draft | Se descarta |
| Instalar sin permiso de orígenes desconocidos | Abre settings, no crashea |
| Descarga incompleta / fallida | Estado `error` con Reintentar; `resumePending` limpia intentos fallidos |
| App muerta durante descarga | `DownloadManager` completa igual; al reabrir `resumePending` → "Lista para instalar" |
| Doble click en "Actualizar ahora" | Deshabilitado mientras `downloading` |
| Web / desktop (PWA, `ng serve`, tests) | `check()` → `null` sin llamar al bridge (no-op) |
| Falla la consulta del último release dev en `build-dev.yml` (`gh api`) | El workflow **falla y no publica** ningún release (sin fallback). El último release `dev-v*` publicado queda como fuente de verdad; el próximo push exitoso numera `+1` sobre él. |

## 7. Criterios de aceptación globales

1. `npm run build`, `npx cap sync android` y `./gradlew assembleDebug` compilan sin errores.
2. Sin conexión o error/rate-limit de GitHub → silencioso, sin crash.
3. Versión local igual o mayor que la remota → sin alertas.
4. "Actualizar ahora" → APK descargado completo → asistente nativo de instalación de Android.
5. **No-op en web/desktop** (incluidos `ng serve` y tests vitest).
6. La comparación funciona con tags prefijados `v` y con etapas (tests unitarios en `version.compare.spec.ts`).
7. "Más tarde" silencia el diálogo 24h; el re-check al `resume` no spamea la API (un request por re-open; GitHub permite 60/h).

## 8. Orden de implementación sugerido

```
A1 → A2 → A3  (Android: se puede probar con llamadas manuales al plugin)
B1 → B2 → B3 → B4 → B5  (Angular: B1/B2 puros con tests, después el resto)
C1 → C3 → C2 (workflow principal + workflow dev + changelog)
```

Nota de alcance (fase actual): sin pantalla de Settings todavía (solo albums/images); el auto-check al iniciar + re-check al `resume` son los únicos puntos de entrada. Cuando exista Settings, el `check(true)` ya está listo para un botón manual.

## 9. Invariantes de diseño (no negociables al implementar)

- **Modelo 1 APK por canal** (confirmado): releases estables → `album-app.apk`; releases dev (cualquier tag) → `album-app-dev.apk`. La app elige el asset según el **canal del release remoto elegido**.
- **Sin `make_latest` en prereleases** (ni dev): `/releases/latest` queda reservado para el último estable.
- **Descarga completa → recién ahí instalar**; `DownloadManager` sobrevive a la muerte de la app.
- **No-op silencioso en web/desktop** (PWA, `ng serve`, tests vitest).
- **Mismo keystore para dev y release en CI** (cuando los secrets existen) — sin esto, actualizar dev→release exige desinstalar.
- **Comparador propio con etapas** (`stable > rc > beta > alpha`), nunca semver puro ni libs externas.

## 10. Runbook — publicar versiones

### Publicar build dev (iteración rápida, cero comandos manuales)

```
git push origin dev
```

`build-dev.yml` hace todo: numera `X.Y.Z` + etapa actual del `package.json` con `N+1` sobre el último build dev publicado (`N=1` si cambia la etapa/base), compila, y publica el release `dev-v0.0.0-beta.N`. La app la detectás en el celular al volver a primer plano.

### Publicar release oficial (etapa alpha/beta/rc/estable)

```
npm run release   # elige etapa + mensaje → bump de versión + tag vX.Y.Z[-etapa.N] + commit
npm run push      # sube código + tags → build-apk.yml compila y publica el release
```

Si no se implementó C2 (changelog automático), editar el `body` del release a mano en GitHub con las notas reales.

## 11. Checklist de verificación manual (E2E en dispositivo)

> Correr completo UNA vez al terminar la implementación. Después, un smoke test acotado alcanza.

**Preparación**
- [ ] App dev instalada en el celular y firmada con el keystore real (secrets en el repo).
- [ ] Un push reciente a `dev` para tener un release dev-* publicado.

**Chequeo de versión**
- [ ] Sin actualización disponible → la app NO muestra ningún diálogo y no crashea.
- [ ] Con actualización → al abrir la app (o volver de background) aparece "Nueva versión disponible" con versión y notas.
- [ ] "Más tarde" → el diálogo no reaparece por 24h.
- [ ] "Más tarde" → un push nuevo a `dev` + re-open vuelve a mostrar (versión mayor).

**Descarga e instalación**
- [ ] "Actualizar ahora" → spinner/progreso; al completar (con la app viva) → "Instalar ahora".
- [ ] Instalación → se abre el asistente nativo de Android.
- [ ] Sin permiso de orígenes desconocidos (Android 8+) → abre el settings correspondiente, sin crash.
- [ ] Matar la app a mitad de descarga → al reabrir, ofrece instalar lo ya descargado (`resumePending`).

**Canal estable**
- [ ] Con una app estable instalada y solo un alpha más nuevo en el pool → NO muestra el diálogo.
- [ ] Con una app estable instalada y solo un build dev (`dev-v*`) más nuevo → NO muestra el diálogo.
- [ ] Con una app estable y un estable más nuevo → muestra el diálogo.

**Canal dev**
- [ ] Con la app dev instalada y un release estable más nuevo (sin build dev nuevo) → NO muestra el diálogo (dev solo mira `dev-v*`).
- [ ] Con la app dev instalada y un build dev más nuevo → muestra el diálogo.

**Web/desktop**
- [ ] `ng serve` / PWA → no-op silencioso, no rompe nada (y los tests vitest pasan).

**CI (workflows)**
- [ ] Push a `dev` → release `dev-v*` (prerelease, sin `latest`).
- [ ] Tag `v0.0.1-alpha.1` → release con `album-app-dev.apk`, prerelease, sin `latest`.
- [ ] Tag `v1.0.0` → release estable con `album-app.apk` y `make_latest`.