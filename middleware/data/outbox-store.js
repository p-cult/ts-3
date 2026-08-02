'use strict';

/**
 * Ephemeral Sheets write-behind outbox.
 * JSON files under dataDir — max retention 24h. Not a source of truth.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TTL_MS = 24 * 60 * 60 * 1000;
const SYNCED_KEEP_MS = 60 * 60 * 1000;

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function nowIso() {
  return new Date().toISOString();
}

function createOutboxStore(opts = {}) {
  const dataDir = opts.dataDir || path.join(__dirname, 'outbox');
  const itemsFile = path.join(dataDir, 'outbox.json');
  const stateFile = path.join(dataDir, 'outbox-state.json');
  const log = opts.log || { debug() {}, warn() {}, info() {} };

  let items = [];
  /** @type {{ rows: Record<string, { masterRow: number, userRow: number, userSheet: string, updatedAt: string }> }} */
  let state = { rows: {} };
  let wakeWaiters = [];

  function load() {
    ensureDir(dataDir);
    try {
      if (fs.existsSync(itemsFile)) {
        const raw = JSON.parse(fs.readFileSync(itemsFile, 'utf8'));
        items = Array.isArray(raw) ? raw : [];
      }
    } catch (err) {
      log.warn('outbox load failed — starting empty', {
        err: String(err && err.message),
      });
      items = [];
    }
    try {
      if (fs.existsSync(stateFile)) {
        const raw = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        state = raw && typeof raw === 'object' ? raw : { rows: {} };
        if (!state.rows || typeof state.rows !== 'object') state.rows = {};
      }
    } catch {
      state = { rows: {} };
    }
  }

  function persistItems() {
    ensureDir(dataDir);
    fs.writeFileSync(itemsFile, JSON.stringify(items, null, 2) + '\n', 'utf8');
  }

  function persistState() {
    ensureDir(dataDir);
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2) + '\n', 'utf8');
  }

  function wake() {
    const waiters = wakeWaiters.slice();
    wakeWaiters = [];
    waiters.forEach((fn) => {
      try {
        fn();
      } catch (_) {
        /* ignore */
      }
    });
  }

  function ageMs(iso) {
    const t = Date.parse(String(iso || ''));
    if (!Number.isFinite(t)) return 0;
    return Date.now() - t;
  }

  load();

  return {
    TTL_MS,

    enqueue(entry) {
      const id = 'ob_' + crypto.randomBytes(8).toString('hex');
      const row = {
        id,
        op: String(entry.op || 'patch'),
        taskId: String(entry.taskId || ''),
        userSheet: String(entry.userSheet || ''),
        row: entry.row ? JSON.parse(JSON.stringify(entry.row)) : null,
        status: 'pending',
        attempts: 0,
        createdAt: nowIso(),
        nextAttemptAt: nowIso(),
        lastError: null,
        syncedAt: null,
      };
      if (!row.taskId || !row.row) {
        throw new Error('outbox enqueue needs taskId and row');
      }
      items.push(row);
      persistItems();
      wake();
      return { ...row, row: JSON.parse(JSON.stringify(row.row)) };
    },

    /**
     * Claim up to `limit` due pending/retry items (marks in_flight).
     */
    claim(limit) {
      const n = Math.max(1, Number(limit) || 5);
      const now = Date.now();
      const out = [];
      for (const item of items) {
        if (out.length >= n) break;
        if (item.status !== 'pending' && item.status !== 'retry') continue;
        const due = Date.parse(String(item.nextAttemptAt || item.createdAt)) || 0;
        if (due > now) continue;
        if (ageMs(item.createdAt) > TTL_MS) {
          item.status = 'dead';
          item.lastError = item.lastError || 'exceeded 24h outbox TTL';
          continue;
        }
        item.status = 'in_flight';
        item.attempts = (Number(item.attempts) || 0) + 1;
        out.push(item);
      }
      if (out.length) persistItems();
      return out.map((x) => ({
        ...x,
        row: x.row ? JSON.parse(JSON.stringify(x.row)) : null,
      }));
    },

    markSynced(id) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx < 0) return null;
      items[idx].status = 'synced';
      items[idx].syncedAt = nowIso();
      items[idx].lastError = null;
      persistItems();
      return { ...items[idx] };
    },

    markRetry(id, errMsg, backoffMs) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx < 0) return null;
      const item = items[idx];
      if (ageMs(item.createdAt) > TTL_MS) {
        item.status = 'dead';
        item.lastError = String(errMsg || 'exceeded 24h outbox TTL');
      } else {
        item.status = 'retry';
        item.lastError = String(errMsg || 'sync failed');
        const wait = Math.max(1000, Number(backoffMs) || 2000);
        item.nextAttemptAt = new Date(Date.now() + wait).toISOString();
      }
      persistItems();
      return { ...item };
    },

    markDead(id, errMsg) {
      const idx = items.findIndex((x) => x.id === id);
      if (idx < 0) return null;
      items[idx].status = 'dead';
      items[idx].lastError = String(errMsg || 'dead');
      persistItems();
      return { ...items[idx] };
    },

    /** Release in_flight back to retry (e.g. process crash recovery). */
    releaseInFlight() {
      let n = 0;
      for (const item of items) {
        if (item.status === 'in_flight') {
          item.status = 'retry';
          item.nextAttemptAt = nowIso();
          n += 1;
        }
      }
      if (n) persistItems();
      return n;
    },

    purge() {
      const before = items.length;
      items = items.filter((item) => {
        if (item.status === 'synced') {
          return ageMs(item.syncedAt || item.createdAt) < SYNCED_KEEP_MS;
        }
        if (ageMs(item.createdAt) > TTL_MS) {
          if (item.status !== 'dead') {
            item.status = 'dead';
            item.lastError = item.lastError || 'purged after 24h TTL';
          }
          // drop dead older than TTL + keep window
          return ageMs(item.createdAt) < TTL_MS + SYNCED_KEEP_MS;
        }
        return true;
      });
      // drop expired dead
      items = items.filter((item) => {
        if (item.status === 'dead' && ageMs(item.createdAt) > TTL_MS + SYNCED_KEEP_MS) {
          return false;
        }
        return true;
      });
      if (items.length !== before) persistItems();

      // row cache: drop entries older than 24h
      let changed = false;
      for (const tid of Object.keys(state.rows)) {
        const r = state.rows[tid];
        if (!r || ageMs(r.updatedAt) > TTL_MS) {
          delete state.rows[tid];
          changed = true;
        }
      }
      if (changed) persistState();
      return { items: before - items.length, rowsPruned: changed };
    },

    getRowCache(taskId) {
      const r = state.rows[String(taskId || '')];
      return r ? { ...r } : null;
    },

    setRowCache(taskId, coords) {
      const tid = String(taskId || '');
      if (!tid) return;
      state.rows[tid] = {
        masterRow: Number(coords.masterRow) || 0,
        userRow: Number(coords.userRow) || 0,
        userSheet: String(coords.userSheet || ''),
        updatedAt: nowIso(),
      };
      persistState();
    },

    statusForTask(taskId) {
      const tid = String(taskId || '');
      const mine = items.filter((x) => x.taskId === tid);
      if (!mine.length) return 'synced';
      if (mine.some((x) => x.status === 'dead')) return 'error';
      if (mine.some((x) => x.status === 'pending' || x.status === 'retry' || x.status === 'in_flight')) {
        return 'pending';
      }
      return 'synced';
    },

    stats() {
      const counts = { pending: 0, retry: 0, in_flight: 0, synced: 0, dead: 0 };
      let oldest = null;
      for (const item of items) {
        counts[item.status] = (counts[item.status] || 0) + 1;
        if (item.status === 'pending' || item.status === 'retry' || item.status === 'dead') {
          const t = Date.parse(item.createdAt) || 0;
          if (!oldest || t < oldest) oldest = t;
        }
      }
      return {
        pending: counts.pending + counts.retry + counts.in_flight,
        dead: counts.dead,
        synced: counts.synced,
        oldestAgeSec: oldest ? Math.floor((Date.now() - oldest) / 1000) : 0,
        rowCacheSize: Object.keys(state.rows).length,
      };
    },

    waitForWake(timeoutMs) {
      const ms = Math.max(100, Number(timeoutMs) || 2000);
      return new Promise((resolve) => {
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve();
        };
        wakeWaiters.push(finish);
        setTimeout(finish, ms);
      });
    },

    _reset() {
      items = [];
      state = { rows: {} };
      persistItems();
      persistState();
    },

    _all() {
      return items.map((x) => ({ ...x, row: x.row ? { ...x.row } : null }));
    },
  };
}

module.exports = { createOutboxStore, TTL_MS, SYNCED_KEEP_MS };
