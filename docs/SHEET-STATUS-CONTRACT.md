# Sheet status contract (Master column K)

**Locked Phase 0 (2026-08-02).** App speaks ts-3 statuses; live Master dropdown speaks sheet words.

## Map

| App (API / memory) | Sheet column K write | Notes |
|--------------------|----------------------|--------|
| Draft / Active / Resume | **Assigned** | Birth always Assigned |
| Pause | **Pause** | Preserved (go-live decision) |
| Blocked | **Rejected** | Legacy sheet word; reads back as Blocked |
| Done (no approval) | **Completed** | Waiting for task approval |
| Done + `⟦TASK_APPROVED⟧` in notes | **Approved** | Task completion approved |

## Read path

| Sheet K | App |
|---------|-----|
| Assigned / Ongoing / … | Active |
| Pause / Paused | Pause |
| Rejected | Blocked |
| Completed / Finished | Done |
| Approved | Done **and** ensure `⟦TASK_APPROVED⟧` on notes |

## Code

- Write: `serializeStatusForSheet` in `middleware/data/sheet-row.js` (used by `taskRowToCells`)
- Read: `normalizeStatus` + `isRawSheetApproved` in `middleware/domain/status.js`
- Approve path: review `feedback` with approval mark → notes + status Done → sheet K **Approved**

## Priority (unchanged)

| App | Sheet |
|-----|-------|
| high | High |
| normal | Medium |
| low | Low |
