'use strict';

/**
 * Side stores — NEVER go through commitBirth / Sheets.
 * stages-store.json + reviews-store.json under dataDir or middleware/data.
 */

const fs = require('fs');
const path = require('path');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

/**
 * @param {{ dataDir: string }} opts
 */
function createSideStores(opts) {
  const base = opts.dataDir || path.join(__dirname);
  const stagesFile = path.join(base, 'stages-store.json');
  const reviewsFile = path.join(base, 'reviews-store.json');

  // In-memory + file persistence
  let stagesByTaskId = readJson(stagesFile, {});
  let reviewsByTaskId = readJson(reviewsFile, {});

  function persistStages() {
    writeJson(stagesFile, stagesByTaskId);
  }
  function persistReviews() {
    writeJson(reviewsFile, reviewsByTaskId);
  }

  // One-time: historical review action "send_back" → "rework"
  let migrated = false;
  for (const arr of Object.values(reviewsByTaskId)) {
    if (!Array.isArray(arr)) continue;
    for (const e of arr) {
      if (e && e.action === 'send_back') {
        e.action = 'rework';
        migrated = true;
      }
    }
  }
  if (migrated) persistReviews();

  return {
    getStages(taskId) {
      const s = stagesByTaskId[taskId];
      if (!s) return null;
      return {
        tokens: Array.isArray(s.tokens) ? s.tokens.slice() : [],
        currentIndex: Number(s.currentIndex) || 0,
      };
    },

    setStages(taskId, { tokens, currentIndex }) {
      stagesByTaskId[taskId] = {
        tokens: (tokens || []).slice(),
        currentIndex: Number(currentIndex) || 0,
      };
      persistStages();
      return this.getStages(taskId);
    },

    clearStages(taskId) {
      delete stagesByTaskId[taskId];
      persistStages();
    },

    getReviews(taskId) {
      const a = reviewsByTaskId[taskId];
      return Array.isArray(a) ? a.map((x) => ({ ...x })) : [];
    },

    /** Last review only — no full-history clone (list path). */
    peekLastReview(taskId) {
      const a = reviewsByTaskId[taskId];
      if (!Array.isArray(a) || !a.length) return null;
      const last = a[a.length - 1];
      return last ? { ...last } : null;
    },

    appendReview(taskId, entry) {
      if (!reviewsByTaskId[taskId]) reviewsByTaskId[taskId] = [];
      reviewsByTaskId[taskId].push({ ...entry });
      persistReviews();
      return this.getReviews(taskId);
    },

    clearReviews(taskId) {
      delete reviewsByTaskId[taskId];
      persistReviews();
    },

    /** test helper */
    _reset() {
      stagesByTaskId = {};
      reviewsByTaskId = {};
      persistStages();
      persistReviews();
    },

    paths: { stagesFile, reviewsFile },
  };
}

module.exports = { createSideStores };
