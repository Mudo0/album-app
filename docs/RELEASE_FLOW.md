# Instructivo: flujo de versionado, release y publicación

Fuente de verdad: `scripts/release.js`, `scripts/push.js`, `scripts/dev-version.js`,
`.github/workflows/build-apk.yml`, `.github/workflows/build-dev.yml`.

---

## 1. Los tres actores

| Quién | Qué hace | Cuándo corre |
|---|---|---|
| `npm run push` (`scripts/push.js`) | Commit de cambios pendientes → push de commits → push de tags → aviso a Discord #changelog | Cuando vos lo llamás |
| `npm run release` (`scripts/release.js`) | Tests + build + **bump de versión + `version.ts` + commit + tag local** (atómico) | Cuando vos lo llamás |
| CI (GitHub Actions) | `build-dev.yml` numera y publica `dev-v*` / `build-apk.yml` compila y publica `v*` | Solo se dispara con push |

**Regla de oro: el CI es el único que publica. Vos solo preparás y subís.**

---

## 2. Flujo A — build dev (iteración rápida)

```
1. cambios en develop
2. npm run push
3. listo → build-dev.yml numera dev-vX.Y.Z[-etapa.N] (N+1) y publica el APK
```

- **No hay paso de bump.** `scripts/dev-version.js` corre en CI, calcula el N+1
  sobre el último release `dev-v*` publicado y aplica `npm version` ahí.
- La numeración (spec C3): misma etapa y misma base → `N+1`; cambia etapa o
  base → `N = 1`. Si la consulta a GitHub falla, el workflow **aborta sin publicar**.
- Recompilar sin pushear: **Actions → Compilar APK Dev → Run workflow**.

---

## 3. Flujo B — release oficial (alpha → beta → rc → estable)

```
1. cambios          → npm run push        (commitea con mensaje descriptivo)
2. release          → npm run release     (etapa + tipo + mensaje)
3. publicar         → npm run push        (sube commits y tags → build-apk.yml)
```

### Paso 1 — cambios

Commiteá **antes** de releasear. `push.js` te pide el mensaje, sube los commits
y avisa a Discord. Si el repo queda sucio, andá al paso 2 igual: `release.js`
hace `git add .` y todo lo pendiente **entra en el commit de versión** (ver §6).

### Paso 2 — `npm run release`

Pipeline interno (en este orden, con rollback automático si algo falla):

0. **Aborta si el árbol está sucio** (`git status --porcelain` con output). Ver §6.
1. Pregunta **etapa**: alpha / beta / rc / estable.
2. Pregunta **tipo de cambio** (patch/minor/major) solo si corresponde — ver §4.
3. Pregunta **mensaje** del cambio.
4. `ng test --no-watch`
5. `ng build`
6. `npm version <nueva> --no-git-tag-version` (actualiza `package.json` + lock)
7. `scripts/generate-version.js` → `src/environments/version.ts`
8. `git add .` + commit `vX.Y.Z[-etapa.N]: <mensaje>`
9. Tag local `vX.Y.Z[-etapa.N]` (si ya existe, lo omite)

Si falla antes del commit → restaura `package.json` y `package-lock.json`.

**No commitea ni pushea tags: eso es el paso 3.**

### Paso 3 — `npm run push`

Sube commits y **después** los tags de release, explícitamente y uno por uno
(`getReleaseTagsToPush()` en `push.js`) — no `git push --tags`. El tag `v*`
dispara `build-apk.yml`, que compila, genera el changelog real (commits desde el
release anterior), crea el release con el APK y notifica Discord + Telegram.

---

## 4. Máquina de versiones (`release.js` → `nextVersion`)

| Versión actual | Etapa elegida | Resultado |
|---|---|---|
| `1.0.0` | alpha/beta/rc | `1.0.0-alpha.1` (base intacta, N=1) |
| `1.0.0-alpha.1` | alpha | `1.0.0-alpha.2` (misma etapa: N+1) |
| `1.0.0-alpha.2` | beta | `1.0.0-beta.1` (cambia etapa: N=1) |
| `1.0.0-beta.2` | rc | `1.0.0-rc.1` |
| `1.0.0-rc.1` | estable | `1.0.0` (publicar: quita el sufijo) |
| `1.0.0` | estable + patch | `1.0.1` (bump de base) |
| `1.0.0-beta.1` | alpha + patch | `1.0.1-alpha.1` (volver atrás: bump base + reset etapa) |

Orden de etapas para la misma base: `stable > rc > beta > alpha`.

Canales (derivados de la versión **local**, ver `docs/feat/implemented/auto-update.md` §2.2):

- Versión local **prerelease** → canal dev → solo mira releases `dev-v*`.
- Versión local **estable** → canal release → solo mira releases `v*` estables.

---

## 5. Cheat-sheet

```bash
npm run push      # commitea + sube commits y tags + Discord #changelog
npm run release   # bump + commit + tag LOCAL (no sube nada)
```

| Situación | Acción |
|---|---|
| Iterar rápido | push a `develop` |
| Publicar release | `npm run push` → `npm run release` → `npm run push` |
| Push dice "estás detrás" | `git pull` y reintentar |
| Push dice "divergieron" | `git pull --rebase`, resolver, reintentar |
| Changelog del release queda vacío | Editar el body a mano en GitHub |
| Falló test/build en release | No hace falta limpiar nada: `release.js` ya restauró la versión |

---

## 6. Trampas conocidas

1. **`push.js` empuja solo tags de release locales (serie `vX.Y.Z`).** No usa
   `git push --tags`: sube explícitamente cada `vX.Y.Z[-etapa.N]` local. Los
   `dev-v*` y los tags experimentales quedan afuera.
   La contra: una release local que **no** querés publicar se sube igual en el
   próximo `npm run push` (su tag matchea la serie). Para descartarla:
   `git tag -d vX.Y.Z` y revertí el commit de versión si hace falta.

2. **`release.js` exige el árbol limpio.** Aborta al inicio si hay cambios sin
   commitear (si no, `stageAndCommit` haría `git add .` y se tragaría todo en el
   commit de versión). Commiteá (`npm run push`) o `git stash` antes.

3. **¿Bump sin release?** No es un paso válido del flujo: la versión *es* la
   identidad del release (el tag `v*` es lo que dispara el CI, y `version.ts`
   alimenta el `versionName` del APK). Un bump sin tag deja una "versión
   fantasma" que la app reporta pero que no existe en GitHub Releases → el
   auto-update no ofrece nada. Si lo necesitás igual (reparar el `package.json`
   o mover la base de la serie dev a propósito):
   `npm version X.Y.Z --no-git-tag-version && node scripts/generate-version.js`.

4. **Todo push a `develop` publica un build dev.** El push del paso 3 de un
   release (si la rama es `develop`) también dispara `build-dev.yml`. Es
   esperado, no rompe nada, pero cuenta con un build dev extra.

5. **El bump no es un paso aparte.** `release.js` calcula la versión desde el
   `package.json` actual y la aplica junto con `version.ts`, el commit y el tag.

6. **Los tags `dev-v*` no disparan `build-apk.yml`** (el filtro es `v*`), y los
   tags `v*` no publican builds dev. Los dos pipelines son disjuntos por diseño.
