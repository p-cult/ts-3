# SLICE-04 — Board UX polish

**Status:** Built (`slice04.test.js`).  
**Depends on:** Slice 01–03.  
**Mode:** `APP_MODE=staging`.

## Delivered

### Stage picker (chips only)
- Progress is set by tapping stage chips (plus Clear). Index is a hidden field only — never a raw number control.
- Draft + inline edit both use the same chip renderer.

### Stage token parse
- Server `domain/stages.js` never throws; returns `{ ok, tokens }` or `{ ok:false, error }`.
- Clear errors for: space after `#` (`# tak`), lone `#`, trailing `#design #`.
- Frontend mirrors the same rules (`parseStageTokensClient`) and blocks SUBMIT/UPDATE on bad input instead of silently stripping tokens.

### Kind-aware form
- `pseudo` / `routine` / `not_a_task` → banner *“This kind only allows status changes.”*
- Content fields (desc, notes, links, dates, stages, parent, …) hidden; status remains.
- Admin keeps Main|Sub + kind radios so they can switch back to Normal.
- Live kind radio changes re-apply the status-only layout.

### P2 status (unchanged, re-tested)
- Create → `Active`; later PATCH only `Pause` / `Resume` / `Done`.

## Out of scope

Google adapter, queue, reports hosting.
