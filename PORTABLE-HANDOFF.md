# Continue ts-3 from the portable drive

This folder is the working Git checkout:

`/Volumes/bkp-01/0proj/code/param/ts-3`

GitHub is the durable remote copy:

`https://github.com/p-cult/ts-3`

**Canonical remotes only:**

```bash
git remote -v
# origin  https://github.com/p-cult/ts-3.git (fetch/push)
```

Do not add personal forks (`vinod-gowda/ts-3`, etc.) as push remotes. Develop as `p-cult`, or as a collaborator with write access on **`p-cult/ts-3`** and **`p-cult/task`** (e.g. `vinod-gowda`; invite other accounts by their exact GitHub login).

Pages UI: `https://github.com/p-cult/task` → `https://p-cult.github.io/task/`  
API: Render service from `p-cult/ts-3`.

## First time on another Mac

1. Connect the `bkp-01` drive.
2. Install Cursor, Git, Node.js 18+, and GitHub CLI.
3. Sign in:

   ```bash
   gh auth login -h github.com
   ```

4. In Cursor, use **File → Open Folder** and open:

   `/Volumes/bkp-01/0proj/code/param/ts-3`

5. Open Cursor's terminal and run:

   ```bash
   ./scripts/portable-check.sh
   ./sync.sh
   npm install
   ./run.sh
   ```

The ignored `.env` file stays on the physical drive and is never uploaded to
GitHub. Render, GitHub Pages, Google Sheets, and Apps Script remain hosted
online.

## Normal work

Before editing (when online):

```bash
./sync.sh
```

Or, equivalently:

```bash
git pull --ff-only origin main
```

After testing:

```bash
git add <changed-files>
git commit -m "Describe the change"
./sync.sh
```

`./sync.sh` is the preferred portable-drive sync (safe pull + optional push).
Details: [docs/SYNC.md](docs/SYNC.md).

Do not copy this folder manually between computers. Open this same folder from
the portable drive. GitHub is the backup and collaboration source; the drive is
the movable working copy.
