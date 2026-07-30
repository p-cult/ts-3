# API Contracts

## Purpose

The required API boundaries, payload expectations, and error semantics. Contract behavior only — no framework choices.

## Two boundaries

**1. Frontend-facing API** — the only contract the browser sees.
- Accepts authenticated requests; returns application-shaped data, never raw spreadsheet payloads.
- Enforces role-aware access; hides raw sheet IDs, tab identifiers, mapping rows, and bridge internals.
- Returns stale-state and sync-state information where relevant.

**2. Internal integration API** — middleware ↔ Apps Script.
- Unreachable from the browser by design.
- Supports read, write, sync, and polling interactions with sheet data.
- An internal system contract, never a public one.

## General rules

- All protected frontend operations go through the frontend-facing boundary; all sheet interactions go through the internal boundary.
- Contracts are platform-agnostic.
- Every write-capable contract requires server-side validation and authorization.
- All contracts support structured success and failure responses.
- Every state-changing frontend request is CSRF-protected; protected responses are session-aware.

## Frontend-facing contract domains

1. **Authentication** — login, invite-only activation/onboarding, session validation, logout, password setup/reset if enabled. Success responses identify authenticated state and role; failures distinguish invalid credentials, inactive account, unauthorized access, and session expiry.
2. **Session** — current session, actor identity, role/permission context, expiry and invalidation.
3. **User & profile** — own profile read/update; admin-protected: user list, invite creation, role assignment, activation/deactivation if supported.
4. **Tasks** — list, detail, create, update, delete/deactivate per business rules, sync trigger, state refresh, conflict-state reporting. Responses return only role-allowed fields, application-safe task identity, no internal sheet row mechanics (unless deliberately abstracted as metadata), and always the master-authoritative state.
5. **Sync** — manual sync initiation, sync status, stale-data state, last-sync metadata where authorized. Responses can indicate: accepted, completed, failed, partially completed, blocked (authorization/validation), or served-from-stale-cache.
6. **Admin** — protected configuration read/update, project definition management if exposed, role/user administration, audit access per role, protected sync/system controls, the secure tasks-only sheet reset, and (development only) sample-data generation.
7. **Audit** — authorized retrieval of audit events; filtering by entity, actor, time, action type, or status if supported. Never exposes secrets or credentials.

## Internal contract domains

Apps Script's whole job — read, write, listen, react — always on middleware instruction:

1. **Read** — master tasks, user-sheet tasks, sync configuration, project reference data, mapping data.
2. **Write** — task data to master and user sheets, mapping updates, in-scope configuration changes.
3. **Listen (polling)** — answer "anything new since marker X?" from a cheap change record Apps Script maintains. A no-change answer is tiny and reads no sheet data; a yes-change answer identifies what changed so middleware fetches only those rows. The poll interval is a middleware setting, tunable without design change.
4. **React (sync)** — execute sheet-to-sheet sync actions middleware requests; return normalized results for middleware's business-rule processing.

## Requests

Every request contract defines: actor/session context where relevant, operation intent, target resource type, target identifier in application-safe form, payload, and trace metadata if supported. The frontend never sends raw spreadsheet identifiers; middleware may use internal identifiers for bridge operations, kept outside the frontend contract.

## Responses

Every frontend-facing response can express: success/failure, data, a human-readable message where useful, a machine-readable code, a stale-data indicator where relevant, and authorization/validation outcome where relevant. Apps Script responses are structured enough for middleware to interpret read, write, and sync outcomes.

## Error taxonomy

The contract layer distinguishes at least: authentication failure · authorization failure · validation failure · not found · conflict / authoritative override · rate-limit rejection · session expired · CSRF failure · internal integration failure · upstream sheet-bridge failure · stale-cache fallback. Error semantics are explicit enough that the frontend never needs knowledge of sheet internals.

## Security

- Frontend contracts never expose raw spreadsheet IDs or bridge endpoints.
- State-changing contracts require signed session context plus CSRF controls.
- Access is role-limited and server-authorized; admin contracts stay closed to unauthorized roles even if the UI is manipulated.
- Integration contracts are not browser-callable.

## Consistency

- The same entities use the same names and semantics across frontend contracts and middleware processing.
- A task returned to the frontend always reflects the master-governed state, even when the latest update came from a user sheet, and sync outcomes reflect the master-overrides-user rule.

## Minimum entities

**Frontend contracts:** Session, AuthAccount, User, Role, Task, TaskList, SyncStatus, AuditEvent, Project, ConfigSubset, ErrorEnvelope.

**Integration contracts:** SheetReadRequest/Result, SheetWriteRequest/Result, SheetSyncRequest/Result, SheetPollRequest/Result.

## Completeness condition

Satisfied only if the frontend can do everything it needs without direct sheet access, middleware can fully orchestrate read/write/poll/sync through internal contracts, and responses support role-based behavior plus stale-data signaling.
