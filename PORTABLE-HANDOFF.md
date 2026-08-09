# Continue ts-3 from the portable drive

This folder is the working Git checkout:

`/Volumes/bkp-01/0proj/code/param/ts-3`

GitHub is the durable remote copy:

`https://github.com/p-cult/ts-3`

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
   npm install
   ./run.sh
   ```

The ignored `.env` file stays on the physical drive and is never uploaded to
GitHub. Render, GitHub Pages, Google Sheets, and Apps Script remain hosted
online.

## Normal work

Before editing:

```bash
git pull --ff-only origin main
```

After testing:

```bash
git add <changed-files>
git commit -m "Describe the change"
git push origin main
```

Do not copy this folder manually between computers. Open this same folder from
the portable drive. GitHub is the backup and collaboration source; the drive is
the movable working copy.
