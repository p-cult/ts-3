# One-box = UI + API in one container (or one Node process).

See **[docs/handover/ONE-BOX-DEPLOY.md](../../docs/handover/ONE-BOX-DEPLOY.md)** for simple steps.

Quick start (offline):

```bash
cp env.memory.example .env
docker compose up --build
# → http://127.0.0.1:4303/
```

Live Sheets: copy `env.live.example` → `.env`, fill bridge secrets, then `docker compose up --build`.
