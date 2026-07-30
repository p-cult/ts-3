# Google Sheets Schema

## Purpose

The required tab layouts, row rules, and cross-sheet relationships. Requirements only — no code.

## Environment

- One master sheet (authoritative source of truth) and multiple user sheets, each a separate file.
- Master account: write access to all user sheets. Users: view-only on the master.
- No spreadsheet is ever accessed directly from the browser.

## Text wrapping rule

In all task-structured tabs (master `task`, master `spam`, user `task`): text wrapping is **clip** for every column except **Task Name, Description, and Notes**, which are **wrap**. Rows stay one line tall except where the three writing columns need height.

## Shared row rules

- Header row = **10**; data starts at row **11** — in every relevant tab.
- A master `task` row is reusable when its Task Id cell (column A) is blank.
- User rows and master rows link through the `mapping` tab. Row numbers are internal sync coordinates, not user-facing identity.

## Master sheet — seven tabs

### `task` (authoritative consolidated task list)

Columns A–J:

| Col | Header |
|-----|--------|
| A | Task Id |
| B | Project |
| C | Task Name |
| D | Description |
| E | Notes |
| F | Priority |
| G | Link |
| H | Start Date |
| I | End Date |
| J | Versions / Status |

### `config`

Key/value storage: A = key, B = value (headers on row 10 if structured). May hold a project-related dropdown at `B11` or an equivalent position. Holds master-level configuration.

### `admin` (project catalog)

| Col | Meaning |
|-----|---------|
| A | ProjectCode — exactly 6 alphanumeric characters |
| B | ProjectName — the label users pick in task entry |

May hold extra admin reference data as long as the code↔name mapping stays stable and unambiguous.

### `content` (all frontend content)

Key/value storage: A = key, B = value.

- Column A is the component or simple identifier (e.g. a label name, an icon name).
- Column B is the corresponding value, which may be: plain text, SVG code for an icon, an image link, a Drive link, or a formula.
- **Every piece of website content is authored in this tab.** No content value is hand-written into the frontend file. Exception on delivery: icon SVG code is authored here but baked into the HTML file's single icon block (refreshed from the sheet by the middleware) rather than fetched by the browser at runtime.

### `mapping` (user-row ↔ master-row links)

| Col | Meaning |
|-----|---------|
| A | Task Id |
| B | MasterRow |
| C | UserSheet identifier |
| D | UserRow |

Each mapping stays stable until its task is cleared or deleted, then becomes inactive.

### `users` (sheet assignment log)

Headers on row 10, one row per user sheet:

| Col | Meaning |
|-----|---------|
| A | UserSheet (user-01 … user-20) |
| B | SheetId |
| C | EmployeeId |
| D | Assigned To (email) |
| E | Status (dev prototype / assigned / unassigned) |
| F | Assigned Date |

The master's authoritative record of which person holds which user sheet. Updated when a sheet is assigned or reclaimed.

### `spam` (quarantine)

Holds rows the middleware rejected because they lack a valid Task ID — the single proof of task existence. Same A–J column layout as `task` so quarantined rows keep their data for review. Rows here are never treated as tasks.

## Task creation rule

Tasks are never created directly in the master `task` tab. Creation happens only from user sheets (frontend-created tasks are written to the creating user's sheet first, then synced). The master may edit existing task rows; edits sync back to the mapped user row.

## User sheets — two tabs

### `task`

Columns A–J identical to the master `task` tab. Project selection in column B; Task Id in column A per the Task ID rules; data entry from row 11.

### `config`

Key/value storage: A = key, B = value. Must hold the employee identifier in a known, stable location — its last 4 characters feed Task ID composition.

## Cross-sheet rules

- **Projects:** user column B values must match ProjectName values in `master!admin`; name→code resolution is deterministic; the same options propagate to all user sheets.
- **Task Ids:** column A in both master and user `task` tabs; a mapped master row and its user row carry the same Task Id.
- **Mapping:** every actively synced task appears in `mapping`; each active Task Id maps to one master row and one user row.
- **Authority:** the master `task` tab wins whenever states conflict.

## Stable reference points

Header row 10 · first data row 11 · task columns A:J (master and user) · config columns A:B · admin columns A:B · mapping columns A:D.

## Completeness condition

Satisfied only if: master and user task tabs share the same column structure, `admin` resolves ProjectName to a 6-character code, `mapping` resolves active user↔master row relationships, and the header/row-offset rules hold everywhere.
