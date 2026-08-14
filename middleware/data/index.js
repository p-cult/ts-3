'use strict';

const path = require('path');
const { createMemoryData } = require('./memory');
const { createSheetsData } = require('./sheets');
const { createSideStores } = require('./side-store');
const { createSheetWriter } = require('./sheet-writer');
const { createHistoryWriter } = require('./history-writer');
const { createQueueStore } = require('./queue-store');
const { createOutboxStore } = require('./outbox-store');
const { createSheetsWorker } = require('../sync/sheets-worker');
const { createBridgeClient } = require('../bridge/client');
const { withRetry, isRetryable } = require('./retry');
const { notImplemented } = require('../errors');
const { joinVisibleAndHistory } = require('../domain/field-class');

function createDataAccess(deps) {
  const config = deps.config;
  const log = deps.log;
  const prodMode =
    !!config.isProd || String(config.appMode || '').toLowerCase() === 'production';
  let refSecret = config.sessionSecret || process.env.SESSION_SECRET || '';
  if (!refSecret) {
    if (prodMode) {
      throw new Error('SESSION_SECRET required when APP_MODE/NODE_ENV is production');
    }
    refSecret = 'dev-ref-secret';
  } else if (prodMode && refSecret === 'dev-ref-secret') {
    throw new Error('dev-ref-secret is forbidden in production');
  }
  const adapter = String(config.storeAdapter || 'memory').toLowerCase();

  const bridge = createBridgeClient({
    bridgeUrl: config.bridgeUrl,
    bridgeSecret: config.bridgeSecret,
    masterSheetId: config.masterSheetId,
    bridgeProtocol: config.bridgeProtocol,
    fetchImpl: config.fetchImpl,
    log,
  });

  const sideDir = path.join(
    config.dataDir || path.join(__dirname, '..', '..', 'data'),
    'side'
  );
  const outboxDir = path.join(
    config.dataDir || path.join(__dirname, '..', '..', 'data'),
    'outbox'
  );
  const side = createSideStores({ dataDir: sideDir });
  const queue = createQueueStore({ dataDir: sideDir });
  const outbox =
    adapter === 'sheets' && !!config.useLiveBridge
      ? createOutboxStore({ dataDir: outboxDir, log })
      : null;

  let inner;
  if (adapter === 'sheets') {
    inner = createSheetsData({
      refSecret,
      stagingWrites: !!config.stagingWrites,
      appMode: config.appMode || 'staging',
      writerOfRecord: config.writerOfRecord || 'ts2',
      useLiveBridge: !!config.useLiveBridge,
      outboxAwaitBirth: !!config.outboxAwaitBirth,
      bridge,
      outbox,
      fixturePath: config.sheetsFixturePath || undefined,
      dataDir: config.dataDir || path.join(__dirname, '..', '..', 'data'),
      log,
    });
  } else {
    inner = createMemoryData({ refSecret });
  }

  const sheets = createSheetWriter(inner);
  const history = createHistoryWriter(side);

  const sheetsWorker =
    outbox && inner && typeof inner.pushLiveBirth === 'function'
      ? createSheetsWorker({
          outbox,
          sheets: inner,
          log,
          intervalMs: Number(config.outboxPollMs) || 1500,
        })
      : null;

  async function deleteByTaskId(id) {
    const row = inner.findByTaskId(id);
    const ok = await Promise.resolve(inner.deleteByTaskId(id));
    if (ok && row) {
      history.clearStages(row.taskId);
      history.clearReviews(row.taskId);
    }
    return ok;
  }

  async function deleteByRef(r) {
    const row = inner.findByRef(r);
    if (!row) return false;
    return deleteByTaskId(row.taskId);
  }

  return {
    kind: inner.kind,
    refSecret,
    get projectsSource() {
      return inner.projectsSource != null ? inner.projectsSource : 'fixture';
    },
    get useLiveBridge() {
      return !!inner.useLiveBridge;
    },
    withRetry: (fn, opts) => withRetry(fn, { log, ...opts }),
    isRetryable,

    async ping() {
      const base = await inner.ping();
      if (outbox) {
        base.outbox = outbox.stats();
      }
      return base;
    },

    async bridgeStatus() {
      if (typeof inner.bridgeStatus === 'function') {
        return inner.bridgeStatus();
      }
      if (!config.useLiveBridge) {
        return { ok: true, state: 'disabled', message: 'USE_LIVE_BRIDGE=false' };
      }
      return bridge.ping();
    },

    async bridge() {
      if (!config.useLiveBridge) {
        throw notImplemented('live bridge disabled');
      }
      return bridge;
    },

    listDepot: () => inner.listDepot(),
    findByTaskId: (id) => inner.findByTaskId(id),
    findByRef: (r) => inner.findByRef(r),
    allTaskIds: () => inner.allTaskIds(),
    usedSubtasks: (pc, suf) => inner.usedSubtasks(pc, suf),
    listUsers: () => inner.listUsers(),
    findUser: (u) => inner.findUser(u),
    listProjects: () => inner.listProjects(),
    findProject: (c) => inner.findProject(c),

    commitBirth: (row) => sheets.commitBirth(row),
    updateByTaskId: (id, p) => sheets.updateByTaskId(id, p),
    updateByRef: (r, p) => sheets.updateByRef(r, p),

    reassignByTaskId: (id, a, u) => inner.reassignByTaskId(id, a, u),
    deleteByTaskId,
    deleteByRef,
    getMapping: (id) => inner.getMapping(id),
    partitionsFor: (id) => inner.partitionsFor(id),
    refFor: (tid) => inner.refFor(tid),

    getStages: (taskId) => history.getStages(taskId),
    setStages: (taskId, s) => history.setStages(taskId, s),
    getReviews: (taskId) => history.getReviews(taskId),
    peekLastReview: (taskId) => history.peekLastReview(taskId),
    appendReview: (taskId, e) => history.appendReview(taskId, e),

    joinHistory(taskId) {
      const row = inner.findByTaskId(taskId);
      if (!row) return null;
      return joinVisibleAndHistory(row, history.snapshot(taskId));
    },

    enqueueDraft: (d) => queue.enqueue(d),
    listQueue: (f) => queue.list(f),
    getQueueItem: (id) => queue.get(id),
    markQueueItem: (id, st, extra) => queue.mark(id, st, extra),

    refreshFromBridge:
      typeof inner.refreshFromBridge === 'function'
        ? () => inner.refreshFromBridge()
        : async () => ({ ok: false, reason: 'not sheets' }),
    refreshProjectsFromBridge:
      typeof inner.refreshProjectsFromBridge === 'function'
        ? () => inner.refreshProjectsFromBridge()
        : async () => ({ ok: false, reason: 'not sheets' }),
    loadMirrorCache:
      typeof inner.loadMirrorCache === 'function'
        ? () => inner.loadMirrorCache()
        : () => ({ ok: false, reason: 'not sheets' }),
    saveMirrorCache:
      typeof inner.saveMirrorCache === 'function'
        ? () => inner.saveMirrorCache()
        : () => false,

    outboxStats: () => (outbox ? outbox.stats() : null),
    syncStatusForTask: (taskId) =>
      outbox && typeof outbox.statusForTask === 'function'
        ? outbox.statusForTask(taskId)
        : 'synced',
    startSheetsWorker: () => {
      if (sheetsWorker) sheetsWorker.start();
    },
    stopSheetsWorker: () => {
      if (sheetsWorker) sheetsWorker.stop();
    },

    _side: side,
    _queue: queue,
    _outbox: outbox,
    _sheetsWorker: sheetsWorker,
    _sheetWriter: sheets,
    _historyWriter: history,
    _bridge: bridge,
    _unsafeMemory: () =>
      typeof inner._unsafeMemory === 'function' ? inner._unsafeMemory() : inner._state,
  };
}

module.exports = {
  createDataAccess,
  withRetry,
  isRetryable,
};
