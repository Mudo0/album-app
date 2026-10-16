# Cleaning Audit – rama develop
Fecha: 2026-10-06

## 0) Resumen Ejecutivo

Estado general: Proyecto Angular 21 + Capacitor + Dexie. Hay build en dist/ (build output) - no debería estar commiteado según .gitignore (contiene /dist), revisar si está trackeado. Existe .env commiteado con un webhook (Discord). Hay algunos console.* (main.ts, dev-seeder), comentarios TODO esporádicos en tests/comentarios, y algunas dependencias con vulns detectadas por npm audit (undici, uuid/xcode) en devDependencies/transitivas.


## 1) Remove (quitar)

### Archivos muertos/huérfanos
- [ ] Verificar si dist/ está trackeado en git: git ls-files dist/ - Razón: build output, debería ignorarse
- [ ] scripts/release.js - Revisar si sigue en uso (npm script 'release')
- [ ] scripts/push.js - Revisar si sigue en uso (npm script 'push')
- [ ] .env - **SEVERIDAD: ALTO** - Existe en repo con DISCORD_WEBHOOK_CHANGELOG. Debería eliminarse del repo (mantener .env.example). Verificar si está ignorado ahora.
- [ ] Archivos .spec.ts huérfanos? Revisar - preservar siempre salvo confirmación 100% huérfanos.

### Assets
- [ ] Revisar assets en public/ vs usos en código
- [ ] Revisar imágenes en src/ (si existen) sin uso

### Dependencias
- [ ] Revisar dependencias no usadas (cruzar imports vs package.json). Posibles candidatas a revisar.


### Dependencias con vulnerabilidades
- [ ] undici (transitiva) - ALTO - Múltiples vulnerabilidades (DoS, cookie injection, response splitting). Via npm audit.
- [ ] uuid v3/v5/v6 (transitiva) - MEDIO - Falta bounds check. Afecta @capacitor/cli transitivamente.


## 3) Code smells / Debug / Logs

- [ ] console.error en main.ts:6
- [ ] console.warn en src/app/core/dev/dev-seeder.service.ts:50
- [ ] console.* en otros archivos? Revisar (dev-only vs producción)
- [ ] Comentarios TODO/FIXME esporádicos detectados (principalmente en specs/comentarios descriptivos) - evaluar necesidad
- [ ] xpect.any(Date) usado en specs - OK, no limpiar tests salvo huérfanos


## 4) Type Safety / Quality

- [ ] Buscar ny, s any, @ts-ignore, @ts-nocheck`n- [ ] Revisar imports circulares (módulos que se referencian entre sí)
- [ ] Revisar strictness en tsconfig.json
- [ ] Barrel files (index.ts reexportando mucho) - posible impacto en tree-shaking?
- [ ] Variables/params sin usar


## 5) Performance/Optimizations

- [ ] Revisar 	rackBy en *ngFor/@for
- [ ] Revisar lazy routes
- [ ] Revisar imágenes sin loading/sizes
- [ ] Bundles grandes (chunk-S3R5RCZK.js ~156KB, chunk-LV3WTZWN.js ~110KB) - evaluar oportunidades de code splitting/lazy loading
- [ ] Revisar uso de OnPush? (estrategia de detección de cambios)


## 6) Config / Repo hygiene

- [ ] dist/ está commiteado? Verificar git tracking - CRÍTICO si trackeado (contradice .gitignore)
- [ ] .angular/cache/ en .gitignore - OK. Cache no commiteado.
- [ ] coverage/ en .gitignore - OK.
- [ ] Revisar .vscode/mcp.json - no tocar
- [ ] .github/, scripts/, CI - no tocar por ahora (regla de seguridad)
- [ ] Android folder (ndroid/) - revisar si hay archivos temporales

## 7) Quick Wins (baja fricción, alto impacto)

1. **Eliminar .env del repo** (CRÍTICO - secreto). git rm --cached .env + commit. Mantener .env.example.
2. **Remover dist/ del repo** si está trackeado (CRÍTICO - basura).
3. **Limpiar console.*** en main.ts y dev-seeder (baja fricción, mejora calidad).
4. **Revisar vulns** - evaluar npm audit fix (no automático, revisar breaking changes).
5. **Limpiar TODOs obsoletos** si no relevantes.

## 8) Notes / Questions (dudas)

- .env tiene webhook Discord real commiteado. Necesario confirmar si este webhook es público/puede rotarse o ya fue expuesto.
- dist/ existe localmente - ¿estaba commiteado anteriormente?
- scripts/release.js y push.js existen - ¿siguen en uso? (tienen npm scripts asociados)
- ¿Queremos limpiar console logs incluso en dev (dev-seeder)? Podrían wrappearse por environment.
- Vulnerabilidades transitivas: @capacitor/cli depende de xcode->uuid. Cambiar versión puede tener breaking change - proponer con cuidado.


**Actualización (git):**
- .env NO está trackeado por git (ignorado por .gitignore). Existe localmente - eliminarlo localmente es seguro.
- dist/ NO está trackeado por git. Build local, no commiteado.


## 9) Búsqueda detallada

### innerHTML / bypassSecurityTrust*


### eval / Function


### any / ts-ignore

- C:\Users\mateo\Desktop\album-app\src\app\core\repositories\albums\local-album.repository.spec.ts:112:        updatedAt: expect.any(Date),
- C:\Users\mateo\Desktop\album-app\src\app\core\repositories\albums\local-album.repository.spec.ts:121:        updatedAt: expect.any(Date),

### index.ts barrels


## 10) tsconfig strictness

    "strict": true,
    "strictInjectionParameters": true,
    "strictInputAccessModifiers": true,
    "strictTemplates": true

- strict: true (OK)
- strictInjectionParameters: true
- strictInputAccessModifiers: true
- strictTemplates: true


## 11) Recomendación de aplicación (solo aprobar, no aplicar)

**CRÍTICOS (primeros):**
1. Eliminar .env localmente (secreto webhook). No committear - solo eliminar archivo local.
2. Verificar tracking de dist (ya confirmado no trackeado).
3. Revisar vulnerabilidades transitivas antes de tocar versiones (breaking changes).

**BAJA FRICCIÓN:**
- Limpiar console.error en main.ts:6 y console.warn en dev-seeder.service.ts:50
- Revisar TODOs concretos (no muchos detectados)
- Revisar assets sin uso si existen

**PRECAUCIÓN:** No tocar .github/, scripts/release.js, scripts/push.js, CI, Docker, android config sin preguntar (regla aplicada).

