# Delivery package — Param Task Board (ts-3)

**Product name:** Param Task Board  
**Internal code name:** ts-3  
**Handover date:** August 2026  

This package describes what is delivered, where it lives, who can access it, and how to verify it works.

---

## 1. What you are receiving

A web Task Board that:

- Shows work from your **Google Sheets** (Master + individual user sheets)
- Lets people **log in**, create and update tasks, review files, and approve completion
- Lets **admins** inject bulk work, manage project lists, and reassign tasks
- Runs as a **split host**: website on GitHub Pages, API on Render, data in Google Sheets

It replaces the older “ts-2” public writing role when Render is set as the sole writer (`WRITER_OF_RECORD=ts3`). Do not run two writers against the same sheets at once.

**Optional portable deploy:** UI + API on one host (Docker/VPS) is documented in **[ONE-BOX-DEPLOY.md](ONE-BOX-DEPLOY.md)**. Google Sheets + bridge stay the same; only hosting of the app changes.

---

## 2. Delivery map (systems)

```text
People (browser)
    │
    ▼
GitHub Pages  ──►  https://p-cult.github.io/task/
    │                   (static UI)
    │ HTTPS /api
    ▼
Render        ──►  https://param-task-middleware.onrender.com
    │                   (Node middleware)
    │ Apps Script bridge
    ▼
Google Sheets ──►  Master workbook + each person’s sheet
```

| Layer | Repository / service | What it holds |
|-------|----------------------|---------------|
| UI | `p-cult/task` | Baked `index.html` for Pages |
| API + source UI | `p-cult/ts-3` | Node middleware, `frontend/index.html`, tests, docs |
| Hosting API | Render service `param-task-middleware` | Production process |
| Data | Google Sheets | Tasks, users, projects (`admin` tab) |
| Bridge | Apps Script web app | Sheet read/write for middleware |

---

## 3. Access checklist (client to complete)

### 3.1 GitHub

- [ ] Organization/account **`p-cult`** (or successor) owns `ts-3` and `task`
- [ ] At least one admin can push to both repos
- [ ] Developers (`vinod-gowda` and others) accepted **collaborator invites** with write access
- [ ] GitHub Actions can run (keep-alive workflow on `p-cult/ts-3`)

### 3.2 Render

- [ ] Dashboard access to service **param-task-middleware**
- [ ] Env vars present: `BRIDGE_URL`, `BRIDGE_SECRET`, `MASTER_ID`, `SESSION_SECRET`, `CORS_ORIGIN=https://p-cult.github.io`, `WRITER_OF_RECORD=ts3`, `USE_LIVE_BRIDGE=true`, `STORE_ADAPTER=sheets`, `APP_MODE=production`
- [ ] Health OK: https://param-task-middleware.onrender.com/api/health

### 3.3 Google

- [ ] Master spreadsheet access for admins
- [ ] Apps Script project + `/exec` URL matches Render `BRIDGE_URL`
- [ ] Script property / secret matches Render `BRIDGE_SECRET`
- [ ] Master **users** tab has usernames, passwords, profile levels
- [ ] Master **admin** tab has project list (Active = Yes for visible projects)

### 3.4 Smoke test after handover

1. Open https://p-cult.github.io/task/ (hard refresh)
2. Log in with a Master **users** tab account (not the offline demo passwords)
3. Confirm board loads tasks
4. As admin: **Update projects** works; project dropdown shows Pseudo Names
5. Create a small test task, then clean it up if needed

---

## 4. Credentials policy

| Environment | What to use |
|-------------|-------------|
| **Production website** | Username + password from Master sheet **users** tab |
| **Local offline demo** (`./run.sh` without live bridge) | Fixture only: `ts3admin` / `ts3-98860` (documented in repo; not for live Sheets unless that row exists) |
| **Secrets** (bridge, session, `.env`) | Never commit to Git. Keep in Render dashboard + local ignored `.env` |

Passwords in the users sheet are plain text by current design — protect the Master spreadsheet accordingly.

---

## 5. Roles (simple)

| Profile | Typical people | Can do |
|---------|----------------|--------|
| **User** | Team members | Own tasks, submit work, update status within rules |
| **Moderator** | Leads | Review files, approve waiting tasks, broader visibility |
| **Admin** | Operations / Vinod-class | Inject, Update projects, delete, reassign, full board |

Exact numbers live in Master **users** column for profile (e.g. 2 / 3 / 4).

---

## 6. Documents included

| File | Use |
|------|-----|
| [CONTINUE-DEVELOPING.md](CONTINUE-DEVELOPING.md) | Engineering handoff |
| [ADMIN-GUIDE.md](ADMIN-GUIDE.md) | Operator training (markdown) |
| [kt-site/admin-guide.html](kt-site/admin-guide.html) | Same guide for your KT website |
| [../HOSTING.md](../HOSTING.md) | Pages + Render env detail |
| [../PUBLISH-PAGES.md](../PUBLISH-PAGES.md) | How to publish UI bake |
| [../../PORTABLE-HANDOFF.md](../../PORTABLE-HANDOFF.md) | Portable-drive workflow (if used) |
| [../../README.md](../../README.md) | Repo entry point |

Historical planning docs (`SLICE-*.md`, `docs/archive/`) are reference only — not day-to-day runbooks.

---

## 7. What is intentionally out of this package

- Changing the Task ID format or minting IDs by hand in Sheets  
- Dual-writer cutover decisions beyond current Render settings  
- Building a separate “admin plugin” product (not required for board operation)  
- Migrating data off Google Sheets (system is sheet-backed by design)

---

## 8. Acceptance sign-off (optional)

| Check | Owner | Date | OK |
|-------|-------|------|----|
| Production board loads | | | ☐ |
| Admin login works (Master users) | | | ☐ |
| Update projects works | | | ☐ |
| Create + edit task works | | | ☐ |
| Needs attention approve works | | | ☐ |
| GitHub write access for named developers | | | ☐ |
| Render env reviewed | | | ☐ |
| Apps Script bridge verified | | | ☐ |

**Delivered by:** _________________  
**Accepted by:** _________________  
**Date:** _________________
