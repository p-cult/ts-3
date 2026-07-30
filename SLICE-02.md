# SLICE-02 — Kinds, stages, review, logs

**Status:** Built with automated tests (`slice02.test.js`).  
**Depends on:** Slice 01 spine + foundation.  
**Mode:** `APP_MODE=staging`.

## Foundation — duplicate never mints

Birth order (locked):

1. Auth + canCreate  
2. Validate input  
3. Resolve assignee  
4. Normalize name (identity `normName`)  
5. **Identity guard** → **409** and **STOP** (no `nextTaskId`, no `commitBirth`)  
6. `nextTaskId`  
7. `commitBirth` (vehicle + depot + mapping only)  
8. Public DTO  

## Kinds

| kind | Public board | User board label | Admin | Edit |
|------|--------------|------------------|-------|------|
| main | yes | structure | yes | full (by role) |
| sub | yes (nested) | structure | yes | full; needs parent |
| pseudo | no | no kind text | icon **P** | **status only** |
| routine | no | no kind text | icon **R** | status only |
| not_a_task | no | no kind text | icon **N** | status only |

- Default create = `main`.  
- Sub = first-class Task ID; `parentRef` on create (user) or admin kind/parent.  
- **Learning:** same project + exact normalized name → inherit kind if learnable (P/R/N).  
- Bulk admin: `POST /api/tasks/bulk` `{ action, ids, kind?, status? }`.

Internal: `kind`, `parentTaskId`.  
Public DTO: never `taskId` / raw parentTaskId; client uses `ref` + `parentRef`; `kind`/`kindIcon` for **P4 only** (subs expose `kind: sub` for nesting). Legacy body alias `parentPublicId` is accepted and mapped to parentRef only.

## Stages (main + sub only)

- Optional free-text tokens `/^#[A-Za-z0-9][A-Za-z0-9._\-]*$/`  
- Progress: `currentIndex / tokens.length`  
- **Side store only:** `data/side/stages-store.json` keyed by internal taskId  
- **Never** `commitBirth` / Sheets  
- `PATCH /api/tasks/:id/stages` — owner or P4  

## Parent Main picker (sub)

- UI: **dropdown of Main tasks** (name + `ref`), not free-text Task ID.  
- Sets `parentRef`. Empty mains → “Create a Main task first.”  
- Parent only when kind/sub; cleared when not sub.

## Review (main + sub only)

States: `none | under_review | rework | approved`  
(Legacy `sent_back` maps to **rework**; `/review/send-back` aliases `/review/rework`.)

| Action | Who | Rule |
|--------|-----|------|
| submit | owner P2+ | **link required** (body or on task) |
| feedback | P3+P4 | notes required |
| **re-work** | P3+P4 | **notes mandatory**; `reviewIteration++` |
| approve | P3+P4 | → Completed |

**Tabs / filters**

| Tab | Who | Query |
|-----|-----|--------|
| Board | all | `board=active` (hides approved) |
| Needs review | P3+P4 | `board=needs_review` |
| Completed | logged-in | `board=completed` (approved) |
| Logs | P2+ | `/api/logs` |

- Link opens in a **new browser tab**; Approve / Re-work stay **in-app**.  
- Notes + history: side-store only. Iteration on task row (`reviewIteration`).  
- After approve: badge on Completed; history in Logs, not full notes on detail card.  

API:

- `POST .../review/submit` `{ link?, notes? }`  
- `POST .../review/feedback` `{ notes }`  
- `POST .../review/rework` `{ notes }` (alias: `send-back`)  
- `POST .../review/approve` `{ notes? }`  

## Logs

- `GET /api/logs` — filters: kind, status, assignee, projectCode, reviewState, q  
- P2 own; P3/P4 broader  
- Joins stages summary + last review  
- UI: filter + CSV export + print CSS  

## UX notes

- **Stage selection:** clickable chips (not a raw index number). Tap a chip to set progress through that stage; progress bar updates. Hint: `#design #build #ship` with **no spaces inside a token**.
- **Parse errors:** name the bad token and say why (e.g. space after `#` → use `#take` not `# tak`).
- **P / R / N form:** status-only UI + banner *“This kind only allows status changes.”* Admin may still change kind **to** P/R/N in one save (kind + status); other fields ignored/hidden.

## Out of scope

Google Sheets, queue, go-live, ts-2 changes.
