# SLICE-10 — Reports (read-only)

**Status:** Built (`slice10.test.js`).

## API

`GET /api/reports/journey?ref=…` — **P3+** only.

Returns `{ ref, task, journey }` where `journey` is `data.joinHistory(taskId)` (visible row + side-store stages/reviews via `joinVisibleAndHistory`).

## UI

Minimal **Reports** panel at top of Logs tab (`frontend/index.html`): ref input + Load journey (P3+ when `canViewReports`).

## Out of scope

Full admin plugin, CSV export of reports, merge planner.
