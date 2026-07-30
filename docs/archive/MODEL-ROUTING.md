# MODEL-ROUTING.md — Smart model choice in pi

**For:** Vinod + every AI session in this repo  
**What it does:** Automatically picks a model for each message — quality when the job is hard, speed when it’s small, **local Qwen** when the cloud is offline.

---

## How it chooses

| Tier | Model (default) | When |
|------|-----------------|------|
| **complex** | **xai / grok-4.5** | Hard work: architecture, security, multi-file, debug, long prompts, key paths (`bridge`, `server.js`, MASTER/AGENTS…) |
| **standard** | **xai / grok-4.3** | Normal feature work / medium prompts |
| **simple** | **xai / grok-build-0.1** | Typos, labels, “where is…”, short fixes |
| **offline** | **lmstudio / qwen** | Cloud unreachable **and** LM Studio is up on `localhost:1234` |

Fallbacks: if the preferred model has no key or isn’t listed, the router tries the next tier (see `.pi/model-routing.json` → `fallbacks`).

---

## How to use (daily)

1. Open this project in **pi** (folder that contains `MASTER.md`).  
2. Trust the project if pi asks (so `.pi/settings.json` + extensions load).  
3. Just chat. You’ll see a small notice like:  
   `Route → quality (Grok 4.5) (heuristic:complex)`  
4. Optional commands:

```text
/route status     → show mode + current model + tiers
/route auto       → automatic (default)
/route on         → same as auto
/route off        → stop auto; use /model yourself
/route complex    → lock Grok 4.5
/route standard   → lock Grok 4.3
/route simple     → lock fast/cheap
/route local      → lock Qwen (needs LM Studio)
```

Manual override anytime: **`/model`** or **Ctrl+L** (routing stays off only if you `/route off`).

Cycle favorites: **Ctrl+P** / **Shift+Ctrl+P** (list from `.pi/settings.json` → `enabledModels`).

---

## Offline / local Qwen

1. Start **LM Studio**.  
2. Load a **Qwen** model and start the local server (port **1234**).  
3. Confirm pi sees it:

```bash
pi --list-models
# should include: lmstudio  qwen
```

4. Either:
   - unplug cloud / wait for auto offline detect, or  
   - run `/route local`

Your global `~/.pi/agent/models.json` already has:

```json
"lmstudio": {
  "baseUrl": "http://localhost:1234/v1",
  "api": "openai-completions",
  "apiKey": "lmstudio",
  "models": [{ "id": "qwen" }]
}
```

If the model id in LM Studio is different (e.g. `qwen2.5-coder`), change:

- `~/.pi/agent/models.json` → `models[].id`  
- `.pi/model-routing.json` → `tiers.offline.model`  
- `.pi/settings.json` → `enabledModels` entry  

to match **exactly**.

---

## Files (this repo)

| Path | Role |
|------|------|
| `.pi/settings.json` | Enables the extension + default Grok 4.5 + cycle list |
| `.pi/model-routing.json` | **Rules** — tiers, keywords, fallbacks, probes |
| `.pi/extensions/model-router.js` | Extension (runs each turn) |
| `.pi/extensions/model-router-classify.js` | Pure classifier (testable) |

Global (your machine, not always in git):

| Path | Role |
|------|------|
| `~/.pi/agent/settings.json` | Your default provider/model |
| `~/.pi/agent/models.json` | LM Studio / custom providers |
| `~/.pi/agent/auth.json` | API keys (`/login`) |

---

## Tune the rules

Edit **`.pi/model-routing.json`**:

- Prefer 4.5 for more work → add keywords under `heuristics.complexKeywords`  
- Send more work to fast tier → expand `simpleKeywords` or raise `simpleMaxChars`  
- Change offline probe → `offline.probeUrl`  
- Turn notify off → `"notify": false`  
- Disable entirely → `"enabled": false` or `/route off`

No pi restart needed for JSON rule edits on next message (extension reloads config each turn). After changing **which extension file** is loaded, restart pi or `/reload` if available.

---

## For AIs in this repo

- Default quality bar for serious code: **Grok 4.5** (complex tier).  
- Don’t fight the router mid-task unless the user locked a tier.  
- If offline and Qwen is weak on a hard bug: say so; ask user to restore cloud or lock complex when online.  
- Project settings live under **`.pi/`** — commit rule changes; never commit secrets/auth.

---

## Quick check

```bash
pi --list-models
node .pi/extensions/model-router-classify.test.js
```

In pi:

```text
/route status
```

Then send a short “fix typo…” (expect fast tier) and a “security audit of bridge…” (expect Grok 4.5).
