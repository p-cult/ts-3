# SLICE-15 — Admin task injection

**Status:** Built (`slice15.test.js`).  
**Who:** P4 only (`canAdmin`).

## Flow

1. **Bulk text** — multi-person / multi-day WhatsApp paste, JSON, CSV, or TSV  
2. **Process** — maps projects onto **master ProjectCodes** only (aliases: Edits/Edits+→`cedt00`, RaSam→`colb06`, Futuremindz→`fmdz07`, etc.), users, status crumbs `(done; approved)`  
3. **Purge / split / skip** — same cleaned name across days = duplicate; purge keeps best (Done first)  
4. **Inject** — only birth hallway; optional project remap dropdown for unresolved hints

| Resolution | Meaning |
|------------|---------|
| **Purge** | Batch dups: keep one. Already on master: drop paste lines. |
| **Split duplicates** | Birth each line as its own task (suffix if needed) |

Purge/Split only after the paste project is verified on the **master project list**. Buttons: **Purge selected** · **Purge all duplicates**.

Live Sheets follow existing Staging write gates + bridge (not a second path).

## UI

Board tab **Inject** (hidden unless admin).

After **Process** (all before final Inject):
1. Each task row — **Project** + **Kind** (+ Purge/Split radios on dups)
2. Toolbar panels — **Filter** → **Select** (one checkbox model: hand-tick or Select all in filter) → **Apply to selected** (project / kind / dup action in one button). Optional **Purge all duplicates** for the whole paste.
3. **Inject into system** — birth hallway (unmapped stay out until mapped)
