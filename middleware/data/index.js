'use strict';

const path = require('path');
const { createMemoryData } = require('./memory');
const { createSideStores } = require('./side-store');
const { withRetry, isRetryable } = require('./retry');
const { notImplemented } = require('../errors');

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

  function deleteByTaskId(id) {
    const row = inner.findByTaskId(id);
    const ok = inner.deleteByTaskId(id);
    if (ok && row) side.clearStages(row.taskId);
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
    commitBirth: (row) => inner.commitBirth(row),
    updateByTaskId: (id, p) => inner.updateByTaskId(id, p),
    updateByRef: (r, p) => inner.updateByRef(r, p),
    deleteByTaskId,
    deleteByRef,
    getMapping: (id) => inner.getMapping(id),
    partitionsFor: (id) => inner.partitionsFor(id),
    refFor: (tid) => inner.refFor(tid),

    getStages: (taskId) => side.getStages(taskId),
    setStages: (taskId, s) => side.setStages(taskId, s),
    getReviews: (taskId) => side.getReviews(taskId),
    appendReview: (taskId, e) => side.appendReview(taskId, e),
    _side: side,
    _unsafeMemory: () => inner._state,
  };
}

module.exports = {
  createDataAccess,
  withRetry,
  isRetryable,
};
