# SLICE-03 — Visible / Invisible dual writers

**Status:** Built (`slice03.test.js`).  
**Depends on:** Slice 01–02 spine.  
**Mode:** `APP_MODE=staging`.

## Goal

Birth and update write **VISIBLE** core fields only to vehicle + depot.  
**INVISIBLE** history (stage token detail, review notes/history) stays in the side-store. Never a second birth path.

## Field classes (`domain/field-class.js`)

| Class | Meaning | Examples |
|-------|---------|----------|
| **visible** | May live on vehicle/depot (sheet-shaped + row meta) | name, status, link, kind, reviewState, reviewIteration |
| **invisible** | Side-store only — refuse on birth/update | `stages`, `reviews`, `reviewHistory`, `reviewNotes` |
| **derived** | DTO/join only — never persist as source | `ref`, `hasLink`, `kindIcon`, `parentRef` |

## Writers

| Writer | File | Job |
|--------|------|-----|
| **sheetWriter** | `data/sheet-writer.js` | `commitBirth` / `update*` → `refuseInvisible` + `pickVisible` → memory store |
| **historyWriter** | `data/history-writer.js` | stages + review append via `side-store.js` only |

`data/index.js` routes birth/update through sheetWriter; stages/reviews through historyWriter.

## Join

`joinVisibleAndHistory(row, side)` (and `data.joinHistory(taskId)`) for logs/reports — visible row + side snapshot. Logs use-case uses the join helper.

## Tests

- Field map classify / pick / refuse  
- sheetWriter refuses stages/reviews; historyWriter never touches depot  
- HTTP birth → depot has no stages/reviews keys  
- PATCH stages → side-store only  
- Direct `commitBirth`/`updateByTaskId` with invisible → error  
- Logs show joined stagesSummary + reviewCount  

## Out of scope

Google Sheets adapter, queue, staging write gate (Slices 05–07).
