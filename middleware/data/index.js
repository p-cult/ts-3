'use strict';

const path = require('path');
const { createMemoryData } = require('./memory');
const { createSheetsData } = require('./sheets');
const { createSideStores } = require('./side-store');
const { createSheetWriter } = require('./sheet-writer');
const { createHistoryWriter } = require('./history-writer');
const { createQueueStore } = require('./queue-store');
const { createBridgeClient } = require('../bridge/client');
const { withRetry, isRetryable } = require('./retry');
const { notImplemented } = require('../errors');
const { joinVisibleAndHistory } = require('../domain/field-class');

function createDataAccess(deps) {
  const config = deps.config;
  const log = deps.log;
  const refSecret = config.sessionSecret || process.env.SESSION_SECRET || 'dev-ref-secret';
  const adapter = String(config.storeAdapter || 'memory').toLowerCase();

  const bridge = createBridgeClient({
    bridgeUrl: config.bridgeUrl,
    bridgeSecret: config.bridgeSecret,
    fetchImpl: config.fetchImpl,
    log,
  });

  let inner;
  if (adapter === 'sheets') {
    inner = createSheetsData({
      refSecret,
      stagingWrites: !!config.stagingWrites,
      appMode: config.appMode || 'staging',
      writerOfRecord: config.writerOfRecord || 'ts2',
      useLiveBridge: !!config.useLiveBridge,
      bridge,
      fixturePath: config.sheetsFixturePath || undefined,
      log,
    });
  } else {
    inner = createMemoryData({ refSecret });
  }

  const sideDir = path.join(
    config.dataDir || path.join(__dirname, '..', '..', 'data'),
    'side'
  );
  const side = createSideStores({ dataDir: sideDir });
  const queue = createQueueStore({ dataDir: sideDir });
  const sheets = createSheetWriter(inner);
  const history = createHistoryWriter(side);

  function deleteByTaskId(id) {
    const row = inner.findByTaskId(id);
    const ok = inner.deleteByTaskId(id);
    if (ok && row) {
      history.clearStages(row.taskId);
      history.clearReviews(row.taskId);
    }
    return ok;
  }

  function deleteByRef(r) {
    const row = inner.findByRef(r);
    if (!row) return false;
    return deleteByTaskId(row.taskId);
  }

  return {
    kind: inner.kind,
    refSecret,
    withRetry: (fn, opts) => withRetry(fn, { log, ...opts }),
    isRetryable,

    async ping() {
      return inner.ping();
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

    _side: side,
    _queue: queue,
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
