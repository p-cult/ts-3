'use strict';

/**
 * Sheets-shaped data adapter — same interface as memory.
 * Slice 05: read path first.
 *
 * Sources:
 *   - fixture JSON (CI / local Staging without live Google)
 *   - optional live bridge reads when USE_LIVE_BRIDGE + configured
 *
 * Writes: refused while STAGING_WRITES=false (clear AppError).
 */

const fs = require('fs');
const path = require('path');
const { validate, usedSubtasksFor } = require('../domain/taskid');
const { refFor } = require('../domain/ref');
const { createMemoryData } = require('./memory');
const { AppError, CODE } = require('../errors');

function loadFixture(fixturePath) {
  const p =
    fixturePath ||
    path.join(__dirname, 'fixtures', 'sheets-depot.json');
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function stagingWritesOff(op) {
  return new AppError(
    CODE.FORBIDDEN,
    'STAGING_WRITES=false — sheet write refused (' + op + ')',
    {
      status: 403,
      details: { op, stagingWrites: false },
      retryable: false,
      expose: true,
    }
  );
}

/**
 * @param {{
 *   refSecret?: string,
 *   stagingWrites?: boolean,
 *   fixturePath?: string,
 *   fixture?: object,
 *   bridge?: object|null,
 *   useLiveBridge?: boolean,
 *   log?: object,
 * }} opts
 */
function createSheetsData(opts = {}) {
  const refSecret = opts.refSecret || process.env.SESSION_SECRET || 'dev-ref-secret';
  const stagingWrites = !!opts.stagingWrites;
  const bridge = opts.bridge || null;
  const useLiveBridge = !!opts.useLiveBridge && bridge && bridge.configured;
  const log = opts.log || { info() {}, warn() {}, debug() {} };

  // Seed in-memory mirror from fixture (sheet-shaped). Live bridge can refresh depot later.
  const fixture = opts.fixture || loadFixture(opts.fixturePath);
  const inner = createMemoryData({ seed: fixture, refSecret });

  const source = useLiveBridge ? 'bridge+fixture' : 'fixture';

  async function refreshFromBridge() {
    if (!useLiveBridge) return { ok: false, reason: 'bridge off' };
    try {
      const depotRes = await bridge.getDepot();
      const rows = (depotRes && (depotRes.rows || depotRes.tasks)) || [];
      // Replace depot contents carefully — only when bridge returns rows
      if (!Array.isArray(rows)) return { ok: false, reason: 'bad depot payload' };
      // For Slice 05 read demo: if bridge returns empty, keep fixture (honest health).
      if (!rows.length) {
        log.warn('bridge getDepot returned 0 rows — keeping fixture mirror');
        return { ok: true, rows: 0, keptFixture: true };
      }
      // Clear + re-ingest via private state (test/ops path)
      const state = inner._state;
      state.depot.length = 0;
      Object.keys(state.vehicle).forEach((k) => delete state.vehicle[k]);
      Object.keys(state.mapping).forEach((k) => delete state.mapping[k]);
      for (const t of rows) {
        // reuse ingest by commitBirth-like path without write gate
        const r = { ...t };
        if (!r.taskId || !validate(r.taskId)) continue;
        state.depot.push(JSON.parse(JSON.stringify(r)));
        const sheet = r.userSheet || 'unknown';
        if (!state.vehicle[sheet]) state.vehicle[sheet] = [];
        state.vehicle[sheet].push(JSON.parse(JSON.stringify(r)));
        state.mapping[r.taskId] = {
          taskId: r.taskId,
          ref: refFor(r.taskId, refSecret),
          userSheet: sheet,
          assigneeUsername: r.assigneeUsername,
        };
      }
      return { ok: true, rows: state.depot.length };
    } catch (err) {
      log.warn('bridge refresh failed', { err: String(err && err.message) });
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  }

  function gateWrite(op, fn) {
    if (!stagingWrites) throw stagingWritesOff(op);
    return fn();
  }

  return {
    kind: 'sheets',
    refSecret,
    source,
    stagingWrites,
    useLiveBridge,

    async ping() {
      const base = await inner.ping();
      return {
        ok: true,
        kind: 'sheets',
        source,
        stagingWrites,
        useLiveBridge,
        depotCount: base.depotCount,
        userCount: base.userCount,
        projectCount: base.projectCount,
      };
    },

    async bridgeStatus() {
      if (!opts.useLiveBridge) {
        return {
          ok: true,
          state: 'disabled',
          message: 'USE_LIVE_BRIDGE=false — sheets adapter on fixture reads',
          source,
        };
      }
      if (!bridge || !bridge.configured) {
        return {
          ok: false,
          state: 'misconfigured',
          message: 'USE_LIVE_BRIDGE=true but bridge client not configured',
        };
      }
      return bridge.ping();
    },

    refreshFromBridge,

    listDepot: () => inner.listDepot(),
    findByTaskId: (id) => inner.findByTaskId(id),
    findByRef: (r) => inner.findByRef(r),
    allTaskIds: () => inner.allTaskIds(),
    usedSubtasks: (pc, suf) => usedSubtasksFor(inner.allTaskIds(), pc, suf),
    listUsers: () => inner.listUsers(),
    findUser: (u) => inner.findUser(u),
    listProjects: () => inner.listProjects(),
    findProject: (c) => inner.findProject(c),

    commitBirth: (row) =>
      gateWrite('commitBirth', () => {
        // Slice 06 will route through bridge writeVehicle → writeDepot → writeMapping
        return inner.commitBirth(row);
      }),
    updateByTaskId: (id, p) =>
      gateWrite('updateByTaskId', () => inner.updateByTaskId(id, p)),
    updateByRef: (r, p) => gateWrite('updateByRef', () => inner.updateByRef(r, p)),
    reassignByTaskId: (id, a, u) =>
      gateWrite('reassignByTaskId', () => inner.reassignByTaskId(id, a, u)),
    deleteByTaskId: (id) => gateWrite('deleteByTaskId', () => inner.deleteByTaskId(id)),
    deleteByRef: (r) => gateWrite('deleteByRef', () => inner.deleteByRef(r)),

    getMapping: (id) => inner.getMapping(id),
    partitionsFor: (id) => inner.partitionsFor(id),
    refFor: (tid) => inner.refFor(tid),

    _state: inner._state,
    _unsafeMemory: () => inner._state,
  };
}

module.exports = { createSheetsData, loadFixture, stagingWritesOff };
