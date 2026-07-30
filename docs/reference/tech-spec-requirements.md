# Technical Specification: Multi-User Task Management System

## Purpose

Requirements for a multi-user task management system made of four layers: a browser frontend, a Node.js middleware, Google Apps Script as a thin bridge, and Google Sheets as the data store. This document covers architecture, module boundaries, dataflow, security, and functional/non-functional requirements. It defines *what* the system must do, not *how* to build it.

## Core principles

- Platform-agnostic; no single hosting provider assumed.
- Frontend: HTML, CSS, and JavaScript only.
- Middleware: server-side JavaScript on Node.js. All business logic lives here.
- Apps Script: a communication bridge only — no business logic.
- The master Google Sheet is the primary source of truth.
- The frontend never talks to Apps Script or Google Sheets directly, and never sees raw sheet IDs, mapping records, or spreadsheet schemas.

## The four layers

### 1. Frontend

The browser app used by all roles (Super Admin, Admin, User, Viewer) — one single HTML file serving every role, like a single godhead with multiple avatars. The page shows each person only the avatar their role allows; the middleware decides which avatar that is. There are no separate pages or files per role.

Does:
- Render task and profile views.
- Send user actions to middleware; receive processed, permission-filtered data back.
- Show a stale-data notice when middleware serves cached data.
- Contain the admin panel in the same app, visible only to admin roles.

Does not:
- Access Sheets or Apps Script directly.
- See raw sheet IDs, mapping records, or sheet schemas.
- Act as the source of truth for roles or permissions.

Build rules:

- **One file.** A single HTML file containing all CSS and JavaScript inline. No external assets, no build step.
- **No baked-in content.** Every piece of content — text, labels, icons, image links — comes from the master sheet's `content` tab (column A = identifier, column B = value: text, SVG code, image link, Drive link, or formula), delivered through the middleware. The HTML file contains structure, behavior, and styling only.
- **One icon store.** Icons are inline SVG in a single symbol block inside the HTML file, reused by reference — never scattered or duplicated through the markup. The `content` tab is where icon SVG code is authored and updated, but the code itself is baked into the HTML file (the middleware refreshes the file's icon block from the sheet); the browser never fetches icons at runtime.
- **One data-to-screen path.** Data from the middleware is interpreted for display in one clearly separated layer (UI structure → UX behavior → visual design), so anyone reading the file can trace how a piece of middleware data becomes something on screen.
- **Human-readable CSS, swappable skins.** CSS stays simple and plainly named, understandable by a non-programmer. All colors, fonts, spacing, and other look-and-feel values live in CSS variables in one block at the top, so a whole new skin means replacing that one block — no hunting through the file.

### 2. Middleware

The central control layer — the only layer that talks to both the frontend and Apps Script.

Does:
- Validate every incoming request server-side.
- Enforce authentication, authorization, and roles.
- Manage user profiles, role assignments, and audit logs.
- Generate Task IDs.
- Handle admin-only operations.
- Serve cached responses (marked stale) during outages.
- Poll the Apps Script bridge for sheet-originated changes.
- Decide all sync outcomes, enforcing the master-overrides-user rule.
- Keep raw spreadsheet identifiers hidden from clients.

Does not:
- Delegate business rules to Apps Script.
- Allow clients to bypass authorization or validation.

### 3. Apps Script bridge

A very thin bridge between the Node.js middleware and Google Sheets. The middleware is its only master; Apps Script does exactly four things, always on the middleware's instruction:

- **Read** — fetch sheet data the middleware asks for.
- **Write** — put data into sheets where the middleware says.
- **Listen** — surface sheet changes so the middleware's polling can pick them up.
- **React** — execute sheet actions (including master↔user sync steps) the middleware commands, and return structured, machine-readable results.

Does not:
- Accept calls from the frontend.
- Decide anything on its own — no business logic of any kind.
- Act as the primary security layer.
- Generate Task IDs, decide roles/permissions, set audit policy, apply admin rules, or resolve conflicts.

### 4. Google Sheets

- One master sheet (authoritative for consolidated tasks, project definitions, mapping, sync configuration, and all frontend content via its `content` tab).
- Multiple user sheets, each a separate file, acting as operational entry and sync surfaces subordinate to the master.

## Hosting and server footprint

Frontend and middleware may be hosted together or separately; the spec allows both.

The server footprint is deliberately minimal — exactly **three files**:

1. **Frontend** — one file: HTML with its CSS and JavaScript inline, one inline-SVG icon store, skin values in one CSS-variable block (see Frontend build rules).
2. **Middleware** — one Node.js file containing all server logic.
3. **Logs archive** — one file holding audit/log records in a secure format, backed up to Google Drive.

No frameworks, build tools, or additional server files. Google Sheets and Apps Script live on Google's side and do not count toward the server footprint.

## Authentication and identity

- Username/password login.
- Account creation is invite-only, initiated by an authorized admin. No public self-registration.
- Sessions are signed and validated server-side.
- Middleware — never the frontend alone — enforces authentication for protected actions.

## Roles (four access profiles)

Everyone reaches the system through the same public URL. Access grows in four tiers, each building on the one below. Login (invite-only) unlocks tiers 2–4; the tier is decided by the middleware, never the frontend.

- **Profile 1 — Public Viewer** (no login): the general, view-only view served at the public URL. Anonymous.
- **Profile 2 — User** (login): everything Profile 1 shows, plus extra fields — but only for *their own* data. Many users can log in, each isolated to their own records; one user never sees another's data.
- **Profile 3 — Moderator** (login): everything above, plus **view all** users' data (read-only across everyone). No editing.
- **Profile 4 — Super Admin** (login): everything above, plus **view and edit all** data, and the admin/control operations.

Naming map to earlier role labels: Profile 1 = Viewer, Profile 2 = User, Profile 3 = Moderator/Admin (read-all), Profile 4 = Super Admin. Frontend visibility comes from middleware authorization; admin surfaces are hidden in the UI by role *and* protected on the server.

## Source of truth and sync

- The master sheet is always authoritative; user sheets can originate updates but never supersede it.
- Changes may originate from the frontend or from sheets (master or user).
- Users can trigger sync from the frontend; middleware polls for sheet-originated changes.
- Middleware makes all sync decisions; Apps Script only executes them.

**Efficient listening (light on the middleware):**

- Apps Script keeps its own cheap record of what changed in the sheets (e.g. a change marker or counter updated when edits happen), so answering "anything new?" costs almost nothing.
- The middleware's poll is a featherweight question: "anything new since my last check?" The normal answer is a tiny "no" — no sheet data is read or transferred when nothing changed.
- Only when something did change does the middleware fetch, and then only the changed rows — never full sheets on every poll.
- The polling interval is a single tunable setting in the middleware, not a design decision baked into code. Faster or slower is a dial turned later.
- Polling must never stack: if one check is still running, the next one waits. A slow or failed check degrades gracefully (skip, log, try again next interval) rather than piling up work.
- **Conflict rule:** if master and user edit the same task before sync, the master version wins — on every sync path.

## Task IDs

- Generated by middleware only — never by Apps Script or the frontend.
- Follow the project + employee + subtask composition rules (see dataflow.md).
- Every write that creates or changes a task passes through middleware-controlled ID generation or validation.

## Module boundaries

**Frontend modules:** authentication, tasks, sync-status/stale-data notice, user profile, role-aware navigation, admin panel, audit view (role-gated). These render and collect input but are never authoritative for validation, authorization, or data truth.

**Middleware modules:** authentication, sessions, authorization/roles, user & profile management, task orchestration, Task ID generation, sync orchestration, Apps Script integration, cache/stale-state, audit logging, rate limiting, admin control, API response shaping.

**Apps Script modules:** read bridge, write bridge, change-listening bridge, react/sync bridge, response formatting — nothing else.

**Data (sheets):** master task data, user task data, project reference data, mapping data, configuration data — kept logically separate.

## Dataflow

**Frontend-originated:** frontend captures action → sends to middleware → middleware validates, authorizes, and decides sync operations → middleware calls Apps Script → Apps Script reads/writes Sheets → returns structured results → middleware resolves final state → returns processed data to frontend.

**Sheet-originated:** a change happens in a sheet → middleware polling picks it up via the bridge → middleware validates it against system rules → resolves sync direction and conflicts → updated state reaches the frontend on the next request or refresh.

**Boundary rule:** frontend and Apps Script are isolated from each other by design.

## API boundaries

**Frontend-facing API** (the only surface the browser sees):
- Application-level contracts only, shaped for frontend use.
- Role-filtered data; no raw sheet IDs, bridge details, or sheet schemas.
- Returns sync status and stale-data state when relevant.
- Error responses distinguish authorization failure, validation failure, and stale/degraded state.

**Middleware-to-Apps-Script API** (internal):
- Separate from the frontend API and unreachable from the browser.
- Carries only the instructions and data needed for sheet operations.

## Security

- **Exposure:** no raw sheet IDs, sheet APIs, or direct Sheets/Apps Script access in the browser — ever, including as an outage fallback.
- **Authorization:** every protected request is authorized server-side, per role. Frontend role checks are cosmetic only.
- **Validation:** every write, every protected read, and every sheet-originated change is validated by middleware before acceptance.
- **Sessions & requests:** signed sessions, CSRF protection on state-changing operations, rate limiting, secrets only in server-side environment variables.
- **Audit:** every write (frontend- or sheet-originated) produces an audit entry recording who/what changed, which entity, and when. Audit entries live in the single logs-archive file, stored in a secure format and backed up to Google Drive.

## Cache and outages

- Normal assumption: middleware is available.
- If middleware is degraded, the last successful response cache may be served — clearly marked stale in the UI, never presented as fresh.

## Functional summary

- Accounts: invite-only creation, username/password login, signed sessions, role-based access, profile management.
- Tasks: view / create / edit per role; sync frontend→sheets; detect and sync sheet-originated changes; master-overrides-user conflicts; middleware-controlled Task IDs.
- **Creation law:** tasks are born only in user sheets — frontend creations are written to the creating user's sheet, then synced. The master sheet edits tasks but never creates them; master edits sync back to the mapped user row.
- **Task ID = existence:** the middleware trusts nothing without a valid Task ID. Rows lacking one are not tasks; they are pushed to the master sheet's `spam` tab for review.
- **Two flavours:** a *pure task* runs creation→completion and is eligible for the **approved** tag; an *action taken* runs creation→log with no approval tag. Only the admin role (Profile 4) classifies entries as legit task vs. routine work, and the classification control is invisible to lower profiles. Each user's profile shows a **Completed** tab of all logged and approved tasks, filterable by approved / logged.
- Admin: role-gated admin panel, protected configuration, user/role management, audit access per role.
- **Sheet reset (tasks only):** the admin panel provides one secure, admin-protected action that resets all Google Sheets by purging task data only — task rows in master and user sheets, and the mapping records. It never touches `config`, `admin`, `content`, or user accounts. It requires an explicit confirmation step, is authorized server-side, and produces an audit entry.
- **Development sample data:** during development, the middleware can generate realistic sample data (projects, tasks with valid Task IDs, mappings) and write it into the already-created sheets through the normal bridge. This capability is admin-protected and disabled in normal production use.

## Non-functional summary

- **Portability:** platform-agnostic.
- **Security:** defense in depth (auth, authorization, request protection, exposure control, secret handling).
- **Reliability:** tolerates middleware outage via stale cache; master remains source of truth.
- **Maintainability:** logic centralized in middleware; Apps Script stays thin; clear module boundaries.
- **Consistency:** the same authorization, conflict, and Task ID rules everywhere, regardless of where a change originated.
- **Observability:** auditable writes; visible stale state.

## Compliance checklist

The spec is satisfied only if all of these hold:

- Frontend talks only to middleware; middleware is the only layer talking to both frontend and Apps Script.
- Apps Script stays a thin bridge with no business logic.
- The master sheet stays the source of truth; conflicts always resolve in the master's favor.
- Sheet changes are detected by middleware polling.
- No raw sheet identifiers or direct sheet access reach the frontend.
- Role authorization, signed sessions, server-side validation, rate limiting, CSRF protection, and audit logging are all enforced.
- Stale cached responses are allowed during outages and visibly marked stale.
- The admin panel is role-hidden in the UI and server-protected.
