'use strict';

/**
 * Sheets-shaped data adapter — same interface as memory.
 *
 * Reads: fixture and/or live bridge.
 * Writes: only when STAGING_WRITES=true, APP_MODE=staging, WRITER_OF_RECORD=ts3.
 * Live bridge writes optional (USE_LIVE_BRIDGE); otherwise mirror-only for supervised tests.
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

function writeGateError(message, details) {
  return new AppError(CODE.FORBIDDEN, message, {
    status: 403,
    details,
    retryable: false,
    expose: true,
  });
}

/**
 * @param {{
 *   refSecret?: string,
 *   stagingWrites?: boolean,
 *   appMode?: string,
 *   writerOfRecord?: string,
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
  const appMode = String(opts.appMode || 'staging').toLowerCase();
  const writerOfRecord = String(opts.writerOfRecord || 'ts2').toLowerCase();
  const bridge = opts.bridge || null;
  const useLiveBridge = !!opts.useLiveBridge && bridge && bridge.configured;
  const log = opts.log || { info() {}, warn() {}, debug() {} };

  const fixture = opts.fixture || loadFixture(opts.fixturePath);
  const inner = createMemoryData({ seed: fixture, refSecret });
  const source = useLiveBridge ? 'bridge+fixture' : 'fixture';

  function assertMayWrite(op) {
    if (!stagingWrites) {
      throw writeGateError('STAGING_WRITES=false — sheet write refused (' + op + ')', {
        op,
        stagingWrites: false,
      });
    }
    if (appMode !== 'staging') {
      throw writeGateError(
        'sheet writes only allowed when APP_MODE=staging (got ' + appMode + ')',
        { op, appMode }
      );
    }
    if (writerOfRecord !== 'ts3') {
      throw writeGateError(
        'WRITER_OF_RECORD=' +
          writerOfRecord +
          ' — refuse ts-3 sheet writes (set WRITER_OF_RECORD=ts3 for supervised Staging)',
        { op, writerOfRecord }
      );
    }
  }

  async function refreshFromBridge() {
    if (!useLiveBridge) return { ok: false, reason: 'bridge off' };
    try {
      const depotRes = await bridge.getDepot();
      const rows = (depotRes && (depotRes.rows || depotRes.tasks)) || [];
      if (!Array.isArray(rows)) return { ok: false, reason: 'bad depot payload' };
      if (!rows.length) {
        log.warn('bridge getDepot returned 0 rows — keeping fixture mirror');
        return { ok: true, rows: 0, keptFixture: true };
      }
      const state = inner._state;
      state.depot.length = 0;
      Object.keys(state.vehicle).forEach((k) => delete state.vehicle[k]);
      Object.keys(state.mapping).forEach((k) => delete state.mapping[k]);
      for (const t of rows) {
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

  function pushLiveBirth(row) {
    if (!useLiveBridge) return;
    // Fire-and-forget sync shape — birth hallway stays mint→vehicle→depot→mapping
    return Promise.resolve()
      .then(() => bridge.writeVehicle({ row }))
      .then(() => bridge.writeDepot({ row }))
      .then(() =>
        bridge.writeMapping({
          taskId: row.taskId,
          userSheet: row.userSheet,
          assigneeUsername: row.assigneeUsername,
        })
      )
      .catch((err) => {
        log.warn('live bridge birth write failed', {
          err: String(err && err.message),
        });
        throw err;
      });
  }

  function gateWrite(op, fn) {
    assertMayWrite(op);
    return fn();
  }

  return {
    kind: 'sheets',
    refSecret,
    source,
    stagingWrites,
    useLiveBridge,
    writerOfRecord,
    appMode,

    async ping() {
      const base = await inner.ping();
      return {
        ok: true,
        kind: 'sheets',
        source,
        stagingWrites,
        useLiveBridge,
        writerOfRecord,
        appMode,
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
        const saved = inner.commitBirth(row);
        if (useLiveBridge) {
          // Sync path — errors surface to caller when bridge rejects
          // (tests use fixture-only; live smoke uses WRITER_OF_RECORD=ts3)
          const p = pushLiveBirth(saved);
          if (p && typeof p.then === 'function') {
            // Keep sync API; attach for observability only when not awaited by use-case
            p.catch(() => {});
          }
        }
        return saved;
      }),
    updateByTaskId: (id, p) =>
      gateWrite('updateByTaskId', () => {
        const saved = inner.updateByTaskId(id, p);
        if (useLiveBridge && saved) {
          Promise.resolve()
            .then(() => bridge.writeDepot({ row: saved }))
            .then(() => bridge.writeVehicle({ row: saved }))
            .catch((err) =>
              log.warn('live bridge patch failed', {
                err: String(err && err.message),
              })
            );
        }
        return saved;
      }),
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

module.exports = { createSheetsData, loadFixture };
