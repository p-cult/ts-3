# SLICE-11 — Hosting split

**Status:** Built (`slice11.test.js`).

## Docs

[docs/HOSTING.md](docs/HOSTING.md) — Pages (frontend) + Render (middleware), env vars, CORS/cookie notes.

## Config

- `CORS_ORIGIN` in `middleware/config.js` (env, default empty = same-origin only).

## Server

- `middleware/server.js` — `applyCors` on `/api/*`; `OPTIONS` → `204`.

## Out of scope

Actual Pages/Render deploy automation (go-live script is slice 12).
