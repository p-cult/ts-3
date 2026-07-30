# Data Schema (Application Entities)

## Purpose

The logical entities, fields, relationships, and validation rules the application must model. This is an application-level schema, not a database design.

## Principles

- The master sheet is the source of truth for task state.
- Frontend-facing entities are application-shaped, never raw sheet-shaped; the app schema stays stable even if sheet structure evolves.
- Middleware owns all business-logic entities.
- Task identity is deterministic and means the same thing everywhere.

## Entities

### AuthAccount — a login-capable account
Account id, username, password credential state, account status (inactive / active / disabled), invite link, role link, created/last-auth timestamps. Lifecycle is invite-only.

### Session — an authenticated context
Session id, actor id, role context, issued time, expiry time, signed-validity state, status. Signing material is never exposed to the frontend.

### User — the application actor
User id, username, display name, role, account status, linked profile, linked user-sheet relationship (internal-safe form), lifecycle timestamps. Kept separable from raw sheet ownership details.

### Role — four access profiles
Values: Public Viewer (Profile 1, no login), User (Profile 2, own data only), Moderator (Profile 3, view all), Super Admin (Profile 4, view + edit all). Each role: id, name, status, permission boundary. Data scoping is enforced server-side: Profile 2 is filtered to the logged-in user's own records; Profiles 3–4 span all users; Profile 4 alone may write across all data.

### Invite — admin-created onboarding
Invite id, target username, issuer, role to assign, state, issued time, expiry time, redemption status.

### UserProfile — non-auth profile data
Profile id, user id, display name, **employee identifier** (its last 4 characters feed Task ID composition), contact metadata if in scope, internal-safe user-sheet reference, status.

### Project — a selectable project
Project id, **code (exactly 6 alphanumeric characters)**, name (the user-facing label in task entry), status, activation metadata if applicable.

### Task — the primary operational entity
Task identifier, project reference, task name, description, notes, priority, link, start date, end date, version/status, source-context metadata, sync metadata, lifecycle state. Fields cover everything the master sheet structure needs.

**Identity:** the Task ID is the primary key across frontend, middleware, and sheet sync. Format: 6-char project code + last 4 chars of employee id + subtask code (1 letter + 2 digits, `A01`…`Z99`; values beyond `Z99` are invalid and rejected).

**Authority:** when master and user states differ, the app exposes the master version.

**Existence:** a valid Task ID is the single proof of existence. Entities without one are never Tasks; they are quarantined to the master `spam` tab.

**Flavour and approval:** every task carries a flavour — *pure task* (full cycle, eligible for the approved tag) or *action taken* (logged, never approved). Classification is set only by the admin role (Profile 4) and is invisible to all lower profiles. Task state must express: flavour, logged status, approved status, and classifier identity — enough to drive the profile Completed tab with its approved/logged filter.

### TaskSyncState — sync status per task
State id, task id, last sync time, origin of latest change, sync result, conflict state, authoritative source (able to record master dominance), stale-data relevance.

### TaskVersion / TaskStateMeta — recency metadata
Created time, updated time, updated-by actor or source, source of last mutation, authoritative-resolution indicator when a conflict occurred. May be a separate entity or a metadata group on Task.

### ConfigEntry — configuration values
Key, value, scope (master-level or user-level), status/version metadata if applicable.

### MappingRecord — user row ↔ master row link
Mapping id, task id, master row reference, user sheet reference, user row reference, status. Stable across updates; deactivated when the task is cleared or deleted.

### AuditEvent — recorded write activity
Event id, timestamp, actor or source (with role if applicable), entity type, entity id, action type, outcome, summary of changed fields, origin channel (frontend or sheet-originated sync). Covers writes from both channels.

### CacheState — stale-response condition
Cache id, scope, generation time, freshness state, stale indicator, reference to the last successful source response. Supports the frontend's stale-data messaging.

### ErrorState — error semantics
Code, category, message, retry relevance, stale-data relevance, authorization/validation context where applicable. Machine-readable and user-facing.

## Relationships

- One AuthAccount ↔ one User; one User ↔ one Role, one UserProfile, one user-sheet relationship (internal-safe), and one employee identifier.
- One User → zero or more Tasks (per scope); one Project → many Tasks.
- One Task → one active MappingRecord (in the row-mapping model) and many AuditEvents over time.

## Validation

The schema must support validating: required fields, role enumeration, project-code length/characters, Task ID composition, subtask sequence, date coherence, write-authorization compatibility, invite lifecycle, and session validity.

## Exposure

Frontend-visible fields are a safe subset. The frontend never receives: secrets, server environment config, session signing material, raw spreadsheet IDs, or bridge credentials.

## Completeness condition

Satisfied only if all entities above exist at the application-model level; task, role, sync, and audit identity are representable without exposing sheet internals; and the schema can express master-authoritative state, sync state, and stale-cache state.
