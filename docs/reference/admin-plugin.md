# admin-plugin.md — Admin · Reports Module Contract

The admin/reports feature is a **plugin, not part of the core**. This document
is its contract: what it owns, how it attaches, and the invariant that keeps
the core untouchable. It joins the six core specs + MASTER.md as the module's
source of truth.

---

## Intent

Give **Moderator (P3) and Super Admin (P4)** one page — `/admin` — to review
task activity and produce reports: filter, group, print, and download.

Give **Super Admin (P4) only** the write tools on that same page: triage queue,
bulk import, sheet reset, slot writes.

Nothing here may change core board / Task ID / sync behaviour. The core product
must work *identically* with this module present or deleted.

## The removability invariant (hard law)

Delete these hooks and the folder, and the app is exactly as before:

1. `middleware/server.js` — `const adminPlugin = require('./admin');`
2. `middleware/server.js` — `if (adminPlugin.handle(req, res, { … })) return;`
3. `frontend/index.html` — the Reports link (`data-min-profile-inline="3"`)
4. `rm -rf middleware/admin/`

Any change that weaves admin logic deeper into the core than these hooks
**violates this contract** and must be rejected or redesigned.

## Isolation rules

- The plugin reaches the core through `ctx` (`datasource`, `currentSession`,
  `bridge`) and two **pure** core modules: `roles.js` (via `access.js`) and
  `tasks.js` counting helpers (via `report.js`). No other core imports.
- The core never imports anything from `middleware/admin/` beyond hook #1.
- Data coupling by FILE: core `audit.js` appends `middleware/data/audit-log.jsonl`;
  plugin `adminlog.js` reads it. Either side works alone.
- Shared look: `middleware/shared/skin.css`, `topbar`, `chrome.css`.

## The secure pipe (how future features attach)

All new admin surfaces **must** gate through `middleware/admin/access.js`:

| Need | Capability | Who |
|------|------------|-----|
| `requireCap(session, res, 'reports')` | `canViewReports` | P3 + P4 |
| `requireCap(session, res, 'admin')` | `canAdmin` | P4 only |

Capabilities are defined once in core `middleware/roles.js`
(`canViewReports`, `canAdmin`, …). Do **not** scatter `profile >= N` in new
handlers — call `access.requireCap`.

Pattern for a future endpoint:

```js
// inside handleInner, after pathname match:
const caps = access.requireCap(session, res, 'reports'); // or 'admin'
if (!caps) return true;
// … feature logic …
```

## What the plugin owns

| Piece | File | Role |
|-------|------|------|
| Access pipe | `access.js` | Caps + 403 helper |
| Route handler | `index.js` | `/api/admin/*` only |
| Report engine | `report.js` | Pure normalize / filter / group / summarize |
| Log reader | `adminlog.js` | Reads audit JSONL |
| Page | `admin.html` | Filters, grouping, exports, P4 write panels |
| Queue / import / reset / slots | `*-api.js`, `bulk-import.js` | P4 write tools |

## Security

- **Reports data** `GET /api/admin/data` — P3 + P4 (server-side).
- **Mutations** queue decide, import, reset, slots write — P4 only (server-side).
- Board "Reports" link shows for profile ≥ 3 (cosmetic). Server is the real gate.
- `handle()` **never throws** — broken ctx → clean 500 JSON.
- Passwords never appear in report payloads (users list is name + userSheet only).
- Plaintext login passwords in the master Users tab are intentional for this
  personal-scale app — do not add hashing in this plugin.

## Report output contract

Client-side, dependency-free:

| Flavour | Shape |
|---------|--------|
| **Print / PDF** | `@media print` + browser print |
| **Report (`.md`)** | Meta + Markdown tables per group |
| **CSV / TSV** | Escaped delimited |
| **JSON** | `{ report, generatedAt, filters, groups:[{key,label,rows}] }` |

Filters available: user, project, status, priority, classification mark,
period (week / month / year / custom date range), free-text search.
Group by: project, user, status, priority, classifier, week, month, year.

Report rows include notes + classifier so guild/admin can review iterations,
admin marks, and silly/hidden items (board still hides silly from P1–P3).

## Known accepted limits

- Sheet dates carry no year; server stamps current year on normalize.
- Page reimplements filter/group client-side; `report.js` exports stay for tests.
- Queue / import / reset panels are hidden for P3 in the UI; API still 403s them.
