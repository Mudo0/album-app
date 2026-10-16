# Vulnerabilidades – Auditoría y remediación
Fecha: 2026-10-16
Rama: `chore/vulns-audit-2026-10-16`
Doc de origen: `docs/CLEANING_AUDIT_2026-10-06.md` (punto 4 del checklist, pendiente)

## 0) Resumen Ejecutivo

`npm audit` inicial: **15 vulnerabilidades** (2 critical, 4 high, 9 moderate).
Tras la remediación: **0 vulnerabilidades**.

Resultado: `15 (2C/4H/9M) → 0` · 193/193 tests OK.

Se resolvieron con bumps dentro de rango semver (sin breaking changes) + 1 `override`
quirúrgico para la cadena `@capacitor/cli → xcode → uuid` (ver §3).

## 1) Clasificación clave: runtime vs dev-only

El punto importante que el `npm audit` **no** distingue: de qué lado del bundle cae cada paquete.

- **Runtime** = se empaqueta en el bundle del navegador → superficie de ataque real en la app instalada.
- **Dev-only** = build tooling / CLI. Corre en la máquina de dev o CI, **nunca** se envía al dispositivo ni al bundle.

En este proyecto, de las 15 vulns **solo 8 tocaban runtime** (paquetes `@angular/*`); las otras 7 eran transitivas de `@angular/build`, `@angular/cli` y `@capacitor/cli` (dev-only). Eso no las hace "falsos positivos" automáticamente, pero cambia radicalmente la severidad real.

## 2) Remediadas

| Paquete | Antes | Después | Sev. audit | Capa | Cómo se resolvió |
|---|---|---|---|---|---|
| @angular/core | 21.2.19 | 21.2.25 | moderate | runtime | bump patch |
| @angular/compiler | 21.2.19 | 21.2.25 | moderate | runtime | bump patch |
| @angular/common | 21.2.19 | 21.2.25 | moderate | runtime | bump patch |
| @angular/compiler-cli | 21.2.19 | 21.2.25 | moderate | dev | bump patch |
| @angular/forms | 21.2.19 | 21.2.25 | moderate | runtime | bump patch |
| @angular/platform-browser | 21.2.19 | 21.2.25 | moderate | runtime | bump patch |
| @angular/router | 21.2.19 | 21.2.25 | high | runtime | bump patch |
| @angular/build | 21.2.19 | 21.2.27 | critical | dev | bump minor |
| @angular/cli | 21.2.19 | 21.2.27 | high | dev | bump minor |
| piscina (transitiva de build) | 5.2.0 | 5.3.2 | critical | dev | arrastrada por build |
| undici (transitiva de build) | 7.28.0 | 7.29.1 | high | dev | arrastrada por build |
| @modelcontextprotocol/sdk (de cli) | 1.30.0 | 1.31.0 | high | dev | arrastrada por cli |

### Advisories cubiertos (Angular runtime)
- `GHSA-hh8m-fm6v-7cvg` – Sanitization bypass via directive host bindings (`@angular/core`, `@angular/compiler`) → requiere contenido de template no confiable. App local con templates propios → explotabilidad baja, pero **real** y parcheado.
- `GHSA-...` – SSR DoS via numeric URL matrix params (`@angular/router`) → **no explotable**: el proyecto no tiene SSR (`ssr: false`, sin `provideClientHydration`). Parcheado igual.
- `GHSA-p297-fm68-3q8c` – HttpTransferCache bypass (`@angular/common`) → **no explotable**: no se usa SSR ni `withRequestsMadeViaParent`. Parcheado igual.

### Advisories dev-only (no llegan al bundle)
- piscina `GHSA-67c8-pqhq-4rmx` (critical, RCE vía prototype-pollution) → build tooling local/CI. Se resolvió solo al subir `@angular/build`.
- undici (14 advisories: DoS, cookie injection, TLS bypass, response splitting) → build tooling. Resuelto al subir build.
- `@modelcontextprotocol/sdk` `GHSA-6qxp-vccf-f47h` (OAuth) → CLI dev. Resuelto al subir cli.

## 3) `@capacitor/cli → xcode → uuid` (resuelta vía override)

Advisory: `GHSA-w5hq-g745-h8pq` — falta bounds check en `uuid` v3/v5/v6 cuando se pasa `buf`.
Rango vulnerable: `uuid <11.1.1`. Fijado: `>=11.1.1`.

**El "fix" que ofrece npm es un downgrade** a `@capacitor/cli@8.4.3` (semver major):
no existe versión parcheada en la línea 8.5.x (último `8.5.3` sigue afectado).

**Cómo se resolvió de verdad** — `overrides` quirúrgico en `package.json`:

```json
"overrides": {
  "xcode": {
    "uuid": "^11.1.1"
  }
}
```

Razonamiento:
1. `xcode@3.0.1` (dependencia de `@capacitor/cli`) declara `uuid@^7.0.3`.
2. `xcode` usa **únicamente `uuid.v4()`** (`lib/pbxProject.js:90`, `var id = uuid.v4()`).
   Las funciones vulnerables (v3/v5/v6 con `buf`) **no se llaman nunca**.
3. `uuid.v4()` es API estable v7→v11; `require('uuid').v4` sigue funcionando (verificado).
4. Ese código solo corre al manipular un **proyecto Xcode iOS**. Este proyecto targetea
   **Android** (`@capacitor/android`; no existe carpeta `ios/`). La ruta es inalcanzable.

Verificación empírica: `npm audit → 0`, `require('uuid').v4()` OK, `require('xcode')` carga OK.

**Riesgo residual**: nulo en la práctica. Re-evaluar cuando Capacitor actualice su `xcode`.

## 4) ¿Rompe algo? Compatibilidad verificada

Todos los bumps quedan dentro de la **misma major (21)**, en la línea `21.2.x`.
Por semver de Angular, los patch/minor de `21.2.x` no introducen breaking changes.
Aun así, verificado contra la configuración real del repo:

| Chequeo | Requerido por lo nuevo | En el repo | ¿OK? |
|---|---|---|---|
| Node | `^20.19.0 \|\| ^22.12.0 \|\| >=24.0.0` (build/cli) | v24.18.0 | ✅ |
| TypeScript | `>=5.9 <6.0` (build) / `>=5.9 <6.1` (compiler-cli) | ~5.9.2 | ✅ |
| tslib | `^2.3.0` (build peer) | ^2.3.0 | ✅ |
| vitest | `^4.0.8` (build peer) | 4.1.11 | ✅ |
| @angular/* lockstep | peers exactas entre sí | todos a 21.2.25 | ✅ |
| Tests | — | 193/193 passed | ✅ |

- **`@angular/*` (common, compiler, compiler-cli, core, forms, platform-browser, router)**: `21.2.19 → 21.2.25`. Misma major/minor.
- **`@angular/build`, `@angular/cli`**: `21.2.19 → 21.2.27`. Misma línea 21.2.x.
- **Transitivas dev-only**: `piscina 5.2→5.3`, `undici 7.28→7.29`, `@modelcontextprotocol/sdk 1.30→1.31` — arrastradas por build/cli, no se referencian en código.
- **`uuid 7.0.3 → 11.1.1`** vía override: única dependencia afectada es `xcode` (iOS-only, usa solo `v4`). Sin impacto en Android ni en runtime.

**Conclusión: no rompe nada.** Cambios dentro de semver, config del repo compatible, 193 tests verdes.

## 5) Notas técnicas / gotcha

- **Angular fija peers EXACTAS entre paquetes** (`@angular/forms@21.2.19` exige `@angular/common@21.2.19` exacto). Por eso `npm update` / `npm audit fix` **no** subieron el framework: el resolver de npm entra en `ERESOLVE` cuando intenta reemplazar unos y no otros.
- Solución aplicada: subir los rangos en `package.json` a las nuevas floors (`^21.2.25` framework, `^21.2.27` build/cli) e instalar en lockstep con `npm install --force`. El árbol queda consistente (una sola versión, dedupeada) — verificado con `npm ls`.
- `npm install --force` es seguro acá **porque** el set objetivo es internamente consistente (todos los `@angular/*` a 21.2.25). No confundir con `npm audit fix --force`.
- Ahora sí hay un `overrides` en el repo (el de `xcode → uuid`, ver §3). No hay `.npmrc` especial.

## 6) Evidencia / comandos

```
# estado inicial y final
npm audit            # 15 (2C/4H/9M) → 0
npm ls @angular/core @angular/build @angular/cli   # 21.2.25 / 21.2.27 / 21.2.27
npm ls uuid          # xcode → uuid@11.1.1
node -e "require('uuid').v4()"                     # OK
npm test             # 18 files, 193 tests passed
```

## 7) Próximos pasos

- [ ] Re-evaluar `@capacitor/cli`/`uuid` en el próximo bump de `@capacitor/*`.
- [ ] Continuar con el resto del `CLEANING_AUDIT`: OnPush (8/17 componentes), deps sin uso, imports circulares, barrels, bundles grandes.
