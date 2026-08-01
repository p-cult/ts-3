'use strict';

/**
 * Queue store — drafts with NO Task ID.
 * Never mints. Approve path must call the one birth hallway.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function createQueueStore(opts = {}) {
  const file = opts.file || path.join(opts.dataDir || __dirname, 'queue-store.json');
  let items = [];
  try {
    if (fs.existsSync(file)) {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      items = Array.isArray(raw) ? raw : [];
    }
  } catch {
    items = [];
  }

  function persist() {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(items, null, 2) + '\n', 'utf8');
  }

  return {
    enqueue(draft) {
      const id = 'q_' + crypto.randomBytes(8).toString('hex');
      const row = {
        queueId: id,
        status: 'pending',
        createdAt: new Date().toISOString(),
        // NEVER a taskId here
        draft: { ...draft },
      };
      delete row.draft.taskId;
      delete row.draft.id;
      items.push(row);
      persist();
      return { ...row, draft: { ...row.draft } };
    },

    list(filter) {
      let out = items.map((x) => ({ ...x, draft: { ...(x.draft || {}) } }));
      if (filter && filter.status) {
        out = out.filter((x) => x.status === filter.status);
      }
      return out;
    },

    get(queueId) {
      const row = items.find((x) => x.queueId === queueId);
      return row ? { ...row, draft: { ...(row.draft || {}) } } : null;
    },

    mark(queueId, status, extra) {
      const idx = items.findIndex((x) => x.queueId === queueId);
      if (idx < 0) return null;
      items[idx] = {
        ...items[idx],
        status,
        decidedAt: new Date().toISOString(),
        ...(extra || {}),
      };
      persist();
      return { ...items[idx], draft: { ...(items[idx].draft || {}) } };
    },

    remove(queueId) {
      const before = items.length;
      items = items.filter((x) => x.queueId !== queueId);
      if (items.length !== before) persist();
      return before !== items.length;
    },

    _reset() {
      items = [];
      persist();
    },
  };
}

module.exports = { createQueueStore };
