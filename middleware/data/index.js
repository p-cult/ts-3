'use strict';

const path = require('path');
const { createMemoryData } = require('./memory');
const { createSideStores } = require('./side-store');
const { createSheetWriter } = require('./sheet-writer');
const { createHistoryWriter } = require('./history-writer');
const { withRetry, isRetryable } = require('./retry');
const { notImplemented } = require('../errors');
const { joinVisibleAndHistory } = require('../domain/field-class');

function createDataAccess(deps) {
  const config = deps.config;
  const log = deps.log;
  const refSecret = config.sessionSecret || process.env.SESSION_SECRET || 'dev-ref-secret';
  const inner = createMemoryData({ refSecret });
  const sideDir = path.join(
    config.dataDir || path.join(__dirname, '..', '..', 'data'),
    'side'
  );
  const side = createSideStores({ dataDir: sideDir });
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
      if (!config.useLiveBridge) {
        return { ok: true, state: 'disabled', message: 'USE_LIVE_BRIDGE=false' };
      }
      return {
        ok: false,
        state: 'unavailable',
        message: 'sheets/bridge not installed',
      };
    },

    async bridge() {
      throw notImplemented('sheets/bridge adapter not installed yet');
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

    // Visible-only birth / update (sheetWriter)
    commitBirth: (row) => sheets.commitBirth(row),
    updateByTaskId: (id, p) => sheets.updateByTaskId(id, p),
    updateByRef: (r, p) => sheets.updateByRef(r, p),

    reassignByTaskId: (id, a, u) => inner.reassignByTaskId(id, a, u),
    deleteByTaskId,
    deleteByRef,
    getMapping: (id) => inner.getMapping(id),
    partitionsFor: (id) => inner.partitionsFor(id),
    refFor: (tid) => inner.refFor(tid),

    // Invisible history (historyWriter / side-store)
    getStages: (taskId) => history.getStages(taskId),
    setStages: (taskId, s) => history.setStages(taskId, s),
    getReviews: (taskId) => history.getReviews(taskId),
    appendReview: (taskId, e) => history.appendReview(taskId, e),

    /** Join depot row + side history for reports/logs. */
    joinHistory(taskId) {
      const row = inner.findByTaskId(taskId);
      if (!row) return null;
      return joinVisibleAndHistory(row, history.snapshot(taskId));
    },

    _side: side,
    _sheetWriter: sheets,
    _historyWriter: history,
    _unsafeMemory: () => inner._state,
  };
}

module.exports = {
  createDataAccess,
  withRetry,
  isRetryable,
};
