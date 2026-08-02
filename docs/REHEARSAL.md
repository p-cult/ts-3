# Phase 5 — Cutover rehearsal report

**Date:** 2026-08-02  
**Operator:** agent-led local dry run  
**Scope:** freeze check → bake → sole-writer smoke → rollback (no public URL flip)

This was a **local** rehearsal against the live thin bridge / Master. It did **not** publish Pages or change Render.

---

## Preconditions (checked at start)

| Check | Result |
|-------|--------|
| ts-2 local `:4300` not listening | **PASS** (0 listeners) |
| ts-3 was live-read on `:4303` (writes off) | **PASS** before sole window |
| `.env` has `BRIDGE_URL` + `BRIDGE_SECRET` | **PASS** |
| `SESSION_SECRET` for production boot | **PASS** (generated for sole session; not committed) |
| Outbox poison cleared | **PASS** before restart; poison `PRJ0019001A01` / `user-ts3admin` reappeared from disk race — cleared again at rollback |

---

## Timed steps

| Step | Action | Target | Actual |
|------|--------|--------|--------|
| T0 | Confirm no dual local writers | — | **0** on `:4300` |
| T1 | `npm run build:pages` | <30s | **~1s** — all bake checks PASS |
| T2 | Restart sole-writer (`APP_MODE=production` `WRITER_OF_RECORD=ts3`) | hydrate OK | **~40s** hydrate 167 rows; banner sole-writer |
| T3 | Smoke: create → Pause → Done → Approve as Vinod | Master K = Approved | **PASS** — see below |
| T4 | Outbox pending≈0 (smoke patches) | <3 min | Smoke patches synced ~**60–90s**; leftover poison ignored |
| T5 | Rollback: live-read, `WRITER_OF_RECORD=ts2`, writes off | health writes off | **PASS** |

**Rough freeze window (local sole + smoke + verify + rollback):** ~**12–15 minutes** wall clock (dominated by Apps Script latency + depot verify).

---

## Smoke identity

| Field | Value |
|-------|-------|
| User | Vinod (`user-02`) |
| Project | PRPA10 |
| Name | `TS3 Rehearsal 20260802-195711` |
| Ref | `f5fbdf93c76d9eb3` |
| Task ID | `PRPA100063A02` |
| Master / user | row **171** / user row **23** |
| Sheet status K | **Approved** |

Birth used `OUTBOX_AWAIT_BIRTH` (synced on create). Patches write-behind then drained.

---

## Pass / fail

| Gate | Pass? | Notes |
|------|-------|-------|
| Bake produces `dist/index.html` with Render API + no fixture passwords | **PASS** | |
| Sole-writer health banner / mode honest | **PASS** | `Production — ts-3 sole sheet reader/writer` |
| Smoke task reaches Master with Approved | **PASS** | depot read |
| Rollback restores writes-off | **PASS** | `writerOfRecord=ts2`, `stagingWrites=false` |
| ts-2 tree untouched | **PASS** | |

---

## Rollback drill (practiced)

1. Kill sole-writer on `:4303`
2. Start live-read env (`STAGING_WRITES=false` `WRITER_OF_RECORD=ts2`)
3. Confirm banner staging / writes off
4. Board still hydrates live tasks

**Production rollback** (not executed): restore previous Pages commit + previous Render deploy of ts-2; never run both writers.

---

## Lessons

1. **Poison outbox** (`user-ts3admin` fixture births) must be purged before sole-writer; mark dead or delete on disk **while process stopped**.
2. Health `/api/health` often **503** during bridge cold ping (2.5s race) even when hydrate succeeded — do not treat as cutover failure alone (S10).
3. Bridge birth/patch latency is **~15–30s** per op; budget freeze window accordingly.
4. Local `SESSION_SECRET` must be set for `APP_MODE=production` or boot refuses.

---

## Open before Phase 6

- [ ] Publish `dist/` to `p-cult/task` — bake on branch **`ts3-cutover-20260802`**, PR https://github.com/p-cult/task/pull/1 (**do not merge until Render sole-writer ready**)
- [ ] Render dashboard twin — see [RENDER-CUTOVER.md](./RENDER-CUTOVER.md); paste non-secret env now; flip repo + `WRITER_OF_RECORD=ts3` only in freeze window
- [ ] Private-window login against Pages → Render (after merge or via branch preview if enabled)
- [x] Full system backup trees + bake copy (`param/_cutover-backup-20260802-200747`) — still need Render deploy ID + Sheet version-history note at freeze
- [ ] Book maintenance window
- [ ] Explicit go-ahead for Phase 6

**GitHub (2026-08-02):** ts-3 cutover commit pushed — `9e6061d` on `p-cult/ts-3` `main`.

---

## Keep-alive

After cutover, ping **`GET /api/health`** on the Render hostname (not the Pages URL).
