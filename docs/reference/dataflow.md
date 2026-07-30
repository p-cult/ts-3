# Sheet Behavior and Task ID Rules

## Purpose

Required behavior, data relationships, permissions, and rules for the Google Sheets side of the system. Requirements only — no implementation details.

## System context

- One **master** Google Sheet and multiple **user** Google Sheets, each user sheet a separate file with its own owner (e.g. `user-01`, `user-02`).
- The master sheet is the central reference for consolidated tasks, project definitions, and the mapping between user rows and master rows.
- The master account has edit access to all user sheets. Users have **view-only** access to the master sheet.

## Sheet structure (summary — full layout in sheets-schema.md)

**Master sheet tabs:**
- `task` — headers on row 10, data from row 11, columns A–J: Task Id, Project, Task Name, Description, Notes, Priority, Link, Start Date, End Date, Versions/Status.
- `config` — key/value configuration; includes a project-related dropdown cell (e.g. `B11`).
- `admin` — the central project reference: column A = project code, column B = project name.
- `content` — all frontend content: column A = component/identifier, column B = value (text, SVG icon code, image link, Drive link, or formula). Nothing content-like is baked into the frontend.
- `mapping` — links user rows to master rows: A = Task Id, B = MasterRow, C = UserSheet identifier, D = UserRow.

**User sheet tabs:**
- `task` — same structure as the master `task` tab.
- `config` — user-specific key/value settings, including the employee identifier in a known location.

## Template rule: user-01 leads, the rest follow

user-01 is the prototype user sheet. Any structural or configuration change made to user-01 during development (columns, headers, dropdowns, validation, formulas) must be synced to all remaining user sheets so every user sheet stays identical in structure. Only per-user values (EmployeeId, the user's own task rows) differ.

## Row mapping

- Every user task row links to exactly one master `task` row.
- Every linked master row traces back to exactly one user sheet and one user row, via the mapping record.
- A mapping stays stable across updates until the task is deleted or cleared.

## Task creation law

- **Tasks are never created in the master sheet.** Creation happens only from user sheets — including frontend-created tasks, which the middleware writes into the creating user's sheet before syncing to master.
- The master can **edit** existing tasks; those edits sync back to the respective user sheet and row.

## Task ID as proof of existence

- The middleware operates entirely on Task ID: a valid Task ID is the single proof a task exists. No valid Task ID → not a legit task.
- Rows that appear without a valid Task ID are not synced into master task data; the middleware pushes them to the **`spam` tab on the master sheet** for review.

## Two task flavours

1. **Pure task** — runs the full cycle from creation to completion and is eventually eligible for the **approved** tag.
2. **Action taken** — runs from creation straight to log; no approval tag.

The admin (Profile 4) decides in the frontend whether an entry is a legit task (pure) or routine work (action/logged). No other profile sees the classification control.

A user's profile shows all logged and approved tasks in a **Completed** tab, filterable by approved / logged.

## Task edit permissions by role

Edit operations are role-gated at the middleware level (server-side enforcement, never client-only). The four access profiles have distinct edit scope:

- **Profile 1 (Public Viewer):** Read-only. No edits permitted.
- **Profile 2 (User):** May edit their own tasks only. Editable fields: name, description, notes, deadline, status (limited to user-allowed statuses). **Cannot edit:** priority (admin-only), classifier (admin-only), project (immutable after creation). Status changes are restricted to a user-defined vocabulary (e.g., Ongoing, Paused, Rejected, Completed); admin-only statuses like Assigned or Approved cannot be set by users but appear in dropdowns when a task is in those states.
- **Profile 3 (Moderator):** May edit any task, but scope is strict — **status only**. Cannot edit name, description, notes, deadline, priority, or classification. Allowed to set any status from the full vocabulary.
- **Profile 4 (Super Admin):** May edit any field on any task (name, description, notes, status, classifier, priority, deadline). Cannot directly change project (immutable) or reassign task ownership (separate admin path). Hand-set priority by admin pins to the task's deadline until deadline changes; clock-based priority resumes after.

Rationale: Profile 2 users own the creation narrative of their tasks and may refine them until completion; Profile 3 moderators are a quality gate (approve only) and never alter the order; Profile 4 admins have full authority.

**Classification is admin-only and invisible (Vinod, 17-Jul — supersedes the 09-Jul "status and classification" moderator charter):** the silly/routine/other classifier may be seen and set ONLY by Profile 4. The field must not be rendered for any lower profile — no other role should even know it exists. Enforced twice: the frontend hides the control below P4, and the middleware rejects classifier changes below P4.

## User → master sync

When a user pushes a task row, it must appear in the master `task` tab:

- **New task:** takes the first empty master row at or below row 11. "Empty" means column A (Task Id) is blank. Earliest empty row first; if none, the next row after the last used row.
- **Existing task (already mapped):** the mapped master row is updated — never duplicated.
- Any field change in a user row can update the corresponding fields in its mapped master row.

## Delete / clear

- Deleting or clearing a user task row clears columns A–J of its mapped master row.
- The cleared master row becomes reusable for future new tasks.
- The mapping record for that relationship stops being active.

## Master → user sync

- A change to a mapped cell in the master `task` tab can be written back to the corresponding cell in the originating user row.
- The target user row is resolved through the mapping (keyed by Task Id or equivalent).
- Master and linked user rows stay logically in sync for two-way fields.

## Project dropdown

- Project options in the user `task` tab (column B, rows 11–1000) come from the master `admin` tab.
- All user sheets show the same project choices, matching the project names in `admin`.
- Changes to the central project list propagate to all user sheets.

## Projects, editions, and pseudo names (admin-controlled)

A "project" in the dropdown is really a **project edition**. Structure lives in the master `admin` tab:

- Each project has a fixed **4-character base code** (Parampara = `prpa`, Vihaara = `vhra`, Kala Samvaada = `klsm`, Tantra = `tntr`, Grant = `grnt`, Collaborations = `clab`, Bytes = `byte`, Life Art Archival = `lirr`, Exhibition = `exbt`).
- Each edition adds a **2-digit edition number** (admin-set). Full 6-char ProjectCode = base + edition, e.g. Parampara 10 → `prpa10`.
- **Admin adds new editions** over time (Parampara 10 → 11 → …). All projects roll editions **except Bytes**, which is continuous (fixed edition `00` → `byte00`).
- Each edition may have an optional **pseudo name** set by admin (Parampara 9 = "Tattva"). When a user selects that edition, the Task Name field is **pre-filled** with `<pseudo> - ` (e.g. "Tattva - ") and the user types the rest after it.
- The user dropdown lists active editions by label (e.g. "Parampara 10"). Users only select; they never add projects or editions.

Admin tab columns (row 10 headers): A Project · B BaseCode · C Edition · D ProjectCode (=B&C, formula) · E Dropdown Label (=A&" "&C, formula) · F Pseudo Name · G Task Prefix (=IF(F<>"",F&" - ","") , formula) · H Active.

## Task ID rules

Task Id is the primary identifier, built from three parts in this exact order:

`[ProjectCode (6 chars)][EmployeeSuffix (4 chars)][SubtaskCode (letter + 2 digits)]`

Example: `PRJ0015678A01` = project `PRJ001` + employee suffix `5678` + subtask `A01`.

1. **Project code** — exactly 6 alphanumeric characters, from the master `admin` tab, paired with a project name there.
2. **Employee suffix** — the last 4 characters of the employee identifier stored in the user's `config` tab.
3. **Subtask code** — 1 letter + 2 digits, marking the user's nth task within that project. Sequence: `A01`–`A99`, then `B01`–`B99`, and so on through `Z99`. `Z99` is the maximum; past it, the system must refuse to generate an ID rather than produce an invalid one.

**Project dependency:** the selected project in column B must be a valid name from `admin`; the row's Task Id must use that project's code; subtask numbering is scoped to that user + that project.

## Reassignment (admin moves a task to another user)

- **Task ID never changes on reassignment.** The ID is permanent identity; its employee digits reflect the *creator* only, not the current owner.
- The master `task` tab carries an **Assigned To** column (current owner) — a dropdown limited to users listed in the master `users` tab. Default = the creating user; admin (Profile 4) edits it to reassign.
- **No row moves.** The task stays in its originating user sheet; the mapping record stays stable. Current ownership lives solely in the master's Assigned To cell.
- Middleware serves each user their tasks by **current Assigned To**, so a reassigned task appears in the new owner's view and leaves the old owner's — regardless of which user sheet physically holds the row.
- Every reassignment writes an **audit log entry**: task id, from-user → to-user, acting admin, timestamp.
- Only users connected in the `users` tab can be assignees.

## Data integrity

- A Task Id never refers to more than one active task row.
- A mapped master row never points to more than one active user row.
- An already-mapped user row updates its master row instead of creating a duplicate.
- A cleared master row stays reusable.
- Project names in user rows match `admin` names exactly, so name→code resolution is deterministic.

## Acceptance conditions

All of the following must be true:

- A new user task fills the first empty master row at or below row 11.
- An existing user task updates its mapped master row, never duplicating.
- Deleting/clearing a user task clears and releases the master row.
- A mapped master cell can be reflected back to the corresponding user cell.
- All user sheets show the same project choices in `task!B11:B1000`.
- Task Id always equals ProjectCode + EmployeeSuffix + SubtaskCode.
- The subtask sequence runs `A01`→`A99`→`B01`… through `Z99`, and the system never generates an ID beyond `Z99`.
