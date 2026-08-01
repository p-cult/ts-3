# SLICE-08 — Classifier / Logged / Make Task

**Status:** Built (`slice08.test.js`).

## Domain

- `middleware/domain/classifier.js` — pure counting: `countsAsCompleted`, `countsAsApproved`, `countsAsLogged`, `isLoggedKind`, `isMakeTaskEligible`.

## Make Task

- **P3+** may promote `routine` / `pseudo` / `not_a_task` → `main` (clear classifier).
- `POST /api/tasks/:ref/make-task` or `PATCH` with `{ kind: 'main' }` — same gate in `authorizeTaskPatch`.
- **P4 only** may set kind **to** restricted kinds (unchanged from slice 02).

## Logged tab

- `GET /api/tasks?board=logged` — **P2+**; rows where kind is `routine` or `not_a_task`.
- `board=active` excludes logged kinds; other board filters unchanged.

## Out of scope

Priority clock, dropdown vocabulary, reports UI.
