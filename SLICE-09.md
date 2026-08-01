# SLICE-09 — Dropdown + status vocabulary

**Status:** Built (`slice09.test.js`).

## API

`GET /api/dropdown-data` → `{ people, projects, statuses }`

| Field | Source |
|-------|--------|
| `people` | users store (`username`, `displayName`) |
| `projects` | projects store (`code`, `name`) |
| `statuses` | hard-coded fallback = `ALL_STATUSES` from `domain/roles.js` |

Public — no auth required (form vocabulary only).

## Out of scope

Sheet-driven content-tab labels (later wave).
