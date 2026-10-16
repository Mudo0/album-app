# Chore: [Nombre breve de la tarea]

- **ID:** chore-[tarea]-[YYYYMMDD]
- **Fecha:** YYYY-MM-DD
- **Ubicación inicial (sin terminar):** chores/pending/
- **Ubicación final (terminada):** chores/done/chore-[tarea]-[YYYYMMDD]-done.md
- **Estado:** PENDING

> **Nota:** Toda tarea en progreso o pendiente de ejecución debe residir estrictamente dentro del directorio `chores/pending/`. Solo se moverá a `chores/done/` una vez completados todos los pasos y superado el checklist.

---

## 1. Archivos Afectados

Lista explícita de archivos a crear, modificar o eliminar.

| Acción      | Ruta del Archivo                        | Propósito del cambio              |
| :---------- | :-------------------------------------- | :-------------------------------- |
| `MODIFICAR` | `src/api/Controllers/UserController.cs` | Inyectar servicio de auditoría    |
| `CREAR`     | `src/core/Services/AuditService.cs`     | Implementación del log de eventos |
| `ELIMINAR`  | `src/core/Legacy/OldLogger.cs`          | Limpieza de código en desuso      |

---

## 2. Pasos Detallados de Implementación

Secuencia estricta y reproducible de ejecución.

1. **[Paso 1: Preparación]**

- Descripción: ...
- Comando / Acción: ...

2. **[Paso 2: Modificación de lógica]**

- Descripción: ...
- Cambios específicos:

```csharp
// Snippet o lógica de referencia
```

3. **[Paso 3: Verificación / Tests]**

- Correr suite de tests: `dotnet test` o `mvn test`
- Validar ausencia de breaking changes y warnings.

---

## 3. Observaciones y Restricciones (Gotchas)

Puntos críticos, dependencias ocultas y lo que **NO** se debe hacer.

- **CUIDADO:** [Ej: No alterar la firma pública del método `X` porque rompe contratos con clientes externos].
- **NO HACER:** [Ej: No ejecutar migraciones de base de datos directamente en el startup de la aplicación].
- **DEPENDENCIAS:** [Ej: Requiere variable de entorno `AUDIT_ENABLED=true` para pruebas locales].

---

## 4. Checklist de Cierre

- [ ] Todos los archivos listados en la sección 1 fueron modificados/creados.
- [ ] Pruebas unitarias/integración pasando al 100%.
- [ ] no hay errores/breaking changes (si es que hay, se informaron).
- [ ] Archivo renombrado agregando `-done` (`chore-[tarea]-[YYYYMMDD]-done.md`).
- [ ] Archivo movido de `chores/pending/` a `chores/done/`.
