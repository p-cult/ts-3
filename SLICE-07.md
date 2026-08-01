# SLICE-07 — Queue (draft → decide → birth)

**Status:** Built (`slice07.test.js`).  
**Default:** `QUEUE_MODE=off` (Vinod enables when ready).

## Law

- Enqueue never mints a Task ID.
- Approve uses the **same** `createTask` birth hallway (identity guard → mint → `commitBirth`).
- Reject discards; no mint.
- No second birth function.

## Behaviour

| Actor | `QUEUE_MODE=on` |
|-------|-----------------|
| P2 | `POST /api/tasks` → **202** queued draft |
| P4 | still direct **201** birth |
| P3/P4 | `GET /api/queue`, `POST /api/queue/:id/approve\|reject` |

## Out of scope

Sheet-backed queue tab, kiosk/WA intake (later waves).
