# Acceptance Tests

## Purpose

The scenarios that must pass for the system to be considered behaviorally correct — covering application behavior, security, synchronization, and data integrity.

## Principles

- Tests validate requirements, not implementation style.
- Coverage spans frontend, middleware, bridge, and sheet-state outcomes — happy paths and failure paths.
- Tests confirm the master sheet stays authoritative and the frontend never needs direct Sheets/Apps Script access.

## Authentication

- **AT-AUTH-001** — An unauthorized visitor attempting self-registration is refused; accounts are invite-only.
- **AT-AUTH-002** — An admin-created invite, completed through the allowed flow, yields a usable username/password account.
- **AT-AUTH-003** — Valid credentials on an active account establish an authenticated signed session.
- **AT-AUTH-004** — Invalid credentials are rejected without exposing sensitive internals.

## Authorization

- **AT-AUTHZ-001** — A non-admin user never sees usable admin areas in the frontend.
- **AT-AUTHZ-002** — A non-admin user manipulating requests to reach admin operations is rejected server-side, regardless of UI state.
- **AT-AUTHZ-003** — A Viewer attempting any write-capable task action is denied.

## Frontend ↔ middleware flow

- **AT-FE-001** — All protected task operations flow through middleware, never directly to Sheets or Apps Script.
- **AT-FE-002** — Task data reaching the frontend is application-shaped, with no raw spreadsheet identifiers or bridge-only fields.

## Middleware ↔ Apps Script

- **AT-BRIDGE-001** — Middleware is the only layer communicating with Apps Script for sheet operations.
- **AT-BRIDGE-002** — Validation, authorization, and Task ID decisions are made by middleware, never Apps Script.

## User-sheet → master sync

- **AT-SYNC-001** — A new user task (no existing mapping) lands in the first available empty master row.
- **AT-SYNC-002** — A changed user task that's already mapped updates its master row instead of duplicating.
- **AT-SYNC-003** — A cleared or deleted user task clears its mapped master row and releases it for reuse.

## Task creation, existence, and flavours

- **AT-CREATE-001** — No path exists that creates a new task directly in the master `task` tab; frontend creations land in the creating user's sheet first, then sync.
- **AT-CREATE-002** — A master-side edit to an existing task syncs back to the mapped user sheet and row.
- **AT-SPAM-001** — A row without a valid Task ID is never accepted as a task; it is moved to the master `spam` tab with its data intact.
- **AT-FLAVOUR-001** — A pure task can complete the full cycle and receive the approved tag; an action-taken entry is logged and can never receive the approved tag.
- **AT-FLAVOUR-002** — Only the admin role (Profile 4) can classify an entry as legit task vs. routine work; every other role is refused, and the classification control is never rendered for profiles below 4.
- **AT-FLAVOUR-003** — A user's Completed tab lists logged and approved tasks and filters correctly by approved / logged.

## Master → user sync

- **AT-MASTER-001** — An allowed master-side change on a mapped row reaches the corresponding user task row.

## Conflict resolution

- **AT-CONFLICT-001** — When the same task is edited in both master and user before sync, the master version prevails.
- **AT-CONFLICT-002** — After such a conflict, the frontend receives the master-governed state.

## Task IDs

- **AT-TASKID-001** — Generated IDs follow ProjectCode + EmployeeSuffix + SubtaskCode.
- **AT-TASKID-002** — The resolved ProjectCode is exactly 6 alphanumeric characters.
- **AT-TASKID-003** — The employee suffix equals the last 4 characters of the employee identifier.
- **AT-TASKID-004** — Subtask codes progress `A01`→`A99`, then `B01`, continuing through `Z99`.
- **AT-TASKID-005** — Beyond `Z99`, Task ID creation is rejected rather than producing an invalid ID.

## Project reference data

- **AT-PROJECT-001** — All user contexts show the same valid project choices from the master reference.
- **AT-PROJECT-002** — A selected project name resolves deterministically to its 6-character code.

## Cache and stale data

- **AT-CACHE-001** — When middleware is unavailable and a cached successful response exists, it can be served.
- **AT-CACHE-002** — Cached data shown in the frontend is visibly marked stale.
- **AT-CACHE-003** — A middleware outage never falls back to direct browser access to Sheets or Apps Script.

## Security controls

- **AT-SEC-001** — No raw Google Sheet IDs appear in frontend responses or rendered state.
- **AT-SEC-002** — State-changing requests without valid CSRF protection are rejected.
- **AT-SEC-003** — Excessive request volume triggers rate limiting.
- **AT-SEC-004** — Malformed or unauthorized write input is rejected by middleware before unsafe state is accepted.
- **AT-SEC-005** — No secrets or server environment values are visible in frontend assets or responses.

## Sheet reset and sample data

- **AT-RESET-001** — The task-purge reset clears task rows (master and user sheets) and mapping records, and nothing else: `config`, `admin`, `content`, and user accounts remain untouched.
- **AT-RESET-002** — The reset is refused for non-admin roles, requires explicit confirmation, and produces an audit event.
- **AT-SAMPLE-001** — Sample-data generation writes valid data (correct Task IDs, valid mappings) into the existing sheets, is admin-protected, and is unavailable in normal production use.

## Audit logging

- **AT-AUDIT-001** — Every successful write produces an audit event.
- **AT-AUDIT-002** — Sheet-originated synchronized writes produce audit events capturing source and outcome.

## Data exposure

- **AT-DATA-001** — Frontend payloads contain only the fields allowed for the requester's role.
- **AT-DATA-002** — Internal bridge-only or sheet-internal fields never appear in frontend responses.

## End-to-end acceptance

The system passes only if: the frontend works entirely through middleware; middleware is the only business-logic authority; the master sheet stays the source of truth in normal operation and conflicts; sync works from both frontend and sheet origins; master-overrides-user holds everywhere; and security controls, stale-cache signaling, audit logging, and role enforcement all hold under test.
