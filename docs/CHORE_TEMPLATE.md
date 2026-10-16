# Chore: [Short task name]

- **ID:** chore-[task]-[YYYYMMDD]
- **Date:** YYYY-MM-DD
- **Initial location (incomplete):** chores/pending/
- **Final location (completed):** chores/done/chore-[task]-[YYYYMMDD]-done.md
- **Status:** PENDING

> **Note:** Every task in progress or pending execution must reside strictly within the `chores/pending/` directory. It will only be moved to `chores/done/` once all steps are completed and the checklist is passed.

---

## 1. Affected Files

Explicit list of files to create, modify, or delete.

| Action      | File Path                               | Purpose of the change              |
| :---------- | :-------------------------------------- | :-------------------------------- |
| `MODIFY`    | `src/api/Controllers/UserController.cs` | Inject audit service              |
| `CREATE`    | `src/core/Services/AuditService.cs`     | Event logging implementation      |
| `DELETE`    | `src/core/Legacy/OldLogger.cs`          | Cleanup of deprecated code        |

---

## 2. Detailed Implementation Steps

Strict and reproducible execution sequence.

1. **[Step 1: Preparation]**

- Description: ...
- Command / Action: ...

2. **[Step 2: Logic modification]**

- Description: ...
- Specific changes:

```csharp
// Reference snippet or logic
```

3. **[Step 3: Verification / Tests]**

- Run the test suite: `dotnet test` or `mvn test`
- Validate absence of breaking changes and warnings.

---

## 3. Observations and Restrictions (Gotchas)

Critical points, hidden dependencies, and what **NOT** to do.

- **CAUTION:** [E.g.: Do not alter the public signature of method `X` because it breaks contracts with external clients].
- **DO NOT:** [E.g.: Do not run database migrations directly on application startup].
- **DEPENDENCIES:** [E.g.: Requires environment variable `AUDIT_ENABLED=true` for local tests].

---

## 4. Closing Checklist

- [ ] All files listed in section 1 were modified/created.
- [ ] Unit/integration tests passing at 100%.
- [ ] No errors/breaking changes (if any, they were reported).
- [ ] File renamed adding `-done` (`chore-[task]-[YYYYMMDD]-done.md`).
- [ ] File moved from `chores/pending/` to `chores/done/`.
