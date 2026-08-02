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
const {
  normalizeSheetTaskRow,
  normalizeSheetProjectRow,
  normalizeSheetUserRow,
} = require('./sheet-row');

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
  let projectsSource = 'fixture';

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

  function resolveAssigneeUsername(row, users) {
    if (row.assigneeUsername) return row.assigneeUsername;
    const label = String(row.assigneeDisplayName || row.assignedTo || '')
      .toLowerCase()
      .trim();
    if (!label) return '';
    for (const u of users || []) {
      if (String(u.username || '').toLowerCase() === label) return u.username;
      if (String(u.displayName || '').toLowerCase() === label) return u.username;
      if (String(u.userSheet || '').toLowerCase() === label) return u.username;
    }
    return '';
  }

  function applyDepotRows(rows, users) {
    const state = inner._state;
    state.depot.length = 0;
    Object.keys(state.vehicle).forEach((k) => delete state.vehicle[k]);
    Object.keys(state.mapping).forEach((k) => delete state.mapping[k]);
    let accepted = 0;
    let skipped = 0;
    for (const raw of rows || []) {
      const base = normalizeSheetTaskRow(raw);
      if (!base) {
        skipped += 1;
        continue;
      }
      const assigneeUsername =
        resolveAssigneeUsername(base, users) || base.assigneeUsername;
      const r = { ...base, assigneeUsername };
      if (!r.taskId || !validate(r.taskId)) {
        skipped += 1;
        continue;
      }
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
      accepted += 1;
    }
    return { accepted, skipped };
  }

  function applyUsers(rawUsers) {
    const state = inner._state;
    const next = [];
    for (const raw of rawUsers || []) {
      const u = normalizeSheetUserRow(raw);
      if (u) next.push(u);
    }
    if (!next.length) return { replaced: false, count: state.users.length };
    state.users.length = 0;
    next.forEach((u) => state.users.push(u));
    return { replaced: true, count: state.users.length };
  }

  function applyProjects(rawProjects) {
    const state = inner._state;
    const next = [];
    for (const raw of rawProjects || []) {
      const p = normalizeSheetProjectRow(raw);
      if (p) next.push(p);
    }
    if (!next.length) return { replaced: false, count: state.projects.length };
    state.projects.length = 0;
    next.forEach((p) => state.projects.push(p));
    projectsSource = 'bridge';
    return { replaced: true, count: state.projects.length };
  }

  /**
   * Hydrate mirror from live bridge.
   * Successful empty depot clears fixture tasks (honest live truth).
   * Bridge failure keeps prior mirror and reports ok:false.
   */
  async function refreshFromBridge() {
    if (!useLiveBridge) return { ok: false, reason: 'bridge off' };
    try {
      const [depotRes, usersRes, projectsRes] = await Promise.all([
        bridge.getDepot(),
        bridge.getUsers().catch((err) => {
          log.warn('bridge getUsers failed', { err: String(err && err.message) });
          return null;
        }),
        bridge.getProjects().catch((err) => {
          log.warn('bridge getProjects failed', { err: String(err && err.message) });
          return null;
        }),
      ]);
      const rows = (depotRes && (depotRes.rows || depotRes.tasks)) || [];
      if (!Array.isArray(rows)) return { ok: false, reason: 'bad depot payload' };

      const usersApplied = usersRes
        ? applyUsers(usersRes.users || usersRes.rows || [])
        : { replaced: false, count: inner._state.users.length };
      const projectsApplied = projectsRes
        ? applyProjects(projectsRes.projects || projectsRes.rows || [])
        : { replaced: false, count: inner._state.projects.length };

      const depotApplied = applyDepotRows(rows, inner._state.users);
      if (!rows.length) {
        log.warn('bridge getDepot returned 0 rows — mirror depot cleared');
      }
      log.info('bridge refresh ok', {
        depot: depotApplied.accepted,
        skipped: depotApplied.skipped,
        users: usersApplied.count,
        projects: projectsApplied.count,
      });
      return {
        ok: true,
        rows: depotApplied.accepted,
        skipped: depotApplied.skipped,
        users: usersApplied.count,
        projects: projectsApplied.count,
        keptFixture: false,
      };
    } catch (err) {
      log.warn('bridge refresh failed — keeping prior mirror', {
        err: String(err && err.message),
      });
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  }

  /**
   * Live birth: vehicle → depot → mapping (law order).
   * Bridge returns row coords; mapping write needs masterRow + userRow.
   */
  async function pushLiveBirth(row) {
    if (!useLiveBridge) return { ok: true, skipped: true };
    try {
      const vehicleRes = await bridge.writeVehicle({ row });
      const depotRes = await bridge.writeDepot({ row });
      const vData = (vehicleRes && vehicleRes.data) || vehicleRes || {};
      const dData = (depotRes && depotRes.data) || depotRes || {};
      const userRow = Number(vData.userRow) || 0;
      const masterRow = Number(dData.masterRow) || 0;
      const mappingRes = await bridge.writeMapping({
        taskId: row.taskId,
        userSheet: row.userSheet,
        assigneeUsername: row.assigneeUsername,
        masterRow,
        userRow,
      });
      log.info('live bridge birth ok', {
        taskId: row.taskId,
        userSheet: row.userSheet,
        masterRow,
        userRow,
      });
      return {
        ok: true,
        masterRow,
        userRow,
        mapping: (mappingRes && mappingRes.data) || mappingRes,
      };
    } catch (err) {
      log.warn('live bridge birth write failed', {
        err: String(err && err.message),
      });
      throw err;
    }
  }

  async function pushLivePatch(row) {
    if (!useLiveBridge || !row) return { ok: true, skipped: true };
    await bridge.writeDepot({ row });
    await bridge.writeVehicle({ row });
    return { ok: true };
  }

  function gateWrite(op, fn) {
    assertMayWrite(op);
    return fn();
  }

  return {
    kind: 'sheets',
    refSecret,
    source,
    get projectsSource() {
      return projectsSource;
    },
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
        projectsSource,
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

    /**
     * Mirror birth, then live push when bridge on.
     * Live failure rolls back the mirror so API cannot claim success silently.
     * @returns {object|Promise<object>}
     */
    commitBirth: (row) =>
      gateWrite('commitBirth', () => {
        const saved = inner.commitBirth(row);
        if (!useLiveBridge) return saved;
        return pushLiveBirth(saved)
          .then(() => saved)
          .catch((err) => {
            try {
              inner.deleteByTaskId(saved.taskId);
            } catch (_) {
              /* keep original bridge error */
            }
            throw err;
          });
      }),
    updateByTaskId: (id, p) =>
      gateWrite('updateByTaskId', () => {
        const saved = inner.updateByTaskId(id, p);
        if (!useLiveBridge || !saved) return saved;
        return pushLivePatch(saved)
          .then(() => saved)
          .catch((err) => {
            log.warn('live bridge patch failed', {
              err: String(err && err.message),
            });
            throw err;
          });
      }),
    updateByRef: (r, p) =>
      gateWrite('updateByRef', () => {
        const saved = inner.updateByRef(r, p);
        if (!useLiveBridge || !saved) return saved;
        return pushLivePatch(saved)
          .then(() => saved)
          .catch((err) => {
            throw err;
          });
      }),
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
