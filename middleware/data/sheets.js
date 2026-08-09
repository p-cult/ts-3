'use strict';

/**
 * Sheets-shaped data adapter — same interface as memory.
 *
 * Reads: fixture and/or live bridge.
 * Writes (live or mirror):
 *   - Staging supervised: APP_MODE=staging + STAGING_WRITES=true + WRITER_OF_RECORD=ts3
 *   - Production sole writer (after cutover): APP_MODE=production + WRITER_OF_RECORD=ts3
 *     (STAGING_WRITES ignored — production is the write path)
 *
 * Live bridge writes are write-behind: mirror commits instantly; outbox syncs Sheets.
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
  toSheetWriteRow,
  hasTaskApprovedMark,
  ensureTaskApprovedMark,
} = require('./sheet-row');
const { normalizeStatus } = require('../domain/status');
const {
  isMasterUserSheetKey,
  canonicalUserSheet,
  normalizeUserSheetOnUser,
} = require('../domain/user-sheet');

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
 *   outbox?: object|null,
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
  const outbox = opts.outbox || null;
  const outboxAwaitBirth = !!opts.outboxAwaitBirth;
  const log = opts.log || { info() {}, warn() {}, debug() {} };
  const dataDir = opts.dataDir || path.join(__dirname, '..', '..', 'data');
  const mirrorFile = path.join(dataDir, 'mirror-cache.json');

  const fixture = opts.fixture || loadFixture(opts.fixturePath);
  const inner = createMemoryData({ seed: fixture, refSecret });
  const source = useLiveBridge ? 'bridge+fixture' : 'fixture';
  let projectsSource = 'fixture';

  function ensureDataDir() {
    try {
      if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    } catch (_) {
      /* ignore */
    }
  }

  /** Persist last-good mirror so Render cold starts can boot if Apps Script flaps. */
  function saveMirrorCache() {
    try {
      ensureDataDir();
      const state = inner._state;
      const payload = {
        savedAt: new Date().toISOString(),
        users: (state.users || []).map((u) => ({ ...u })),
        projects: (state.projects || []).map((p) => ({ ...p })),
        tasks: (state.depot || []).map((t) => ({ ...t })),
      };
      fs.writeFileSync(mirrorFile, JSON.stringify(payload) + '\n', 'utf8');
      return true;
    } catch (err) {
      log.warn('mirror cache save failed', { err: String(err && err.message) });
      return false;
    }
  }

  function loadMirrorCache() {
    try {
      if (!fs.existsSync(mirrorFile)) return { ok: false, reason: 'no mirror cache' };
      const raw = JSON.parse(fs.readFileSync(mirrorFile, 'utf8'));
      const users = Array.isArray(raw.users) ? raw.users : [];
      const projects = Array.isArray(raw.projects) ? raw.projects : [];
      const tasks = Array.isArray(raw.tasks) ? raw.tasks : [];
      if (!tasks.length && !users.length) {
        return { ok: false, reason: 'mirror cache empty' };
      }
      const state = inner._state;
      state.users.length = 0;
      users.forEach((u) => state.users.push(u));
      state.projects.length = 0;
      projects.forEach((p) => state.projects.push(p));
      applyDepotRows(tasks, state.users);
      projectsSource = 'mirror-cache';
      log.info('loaded mirror cache', {
        tasks: tasks.length,
        users: users.length,
        projects: projects.length,
        savedAt: raw.savedAt || null,
      });
      return {
        ok: true,
        fromCache: true,
        rows: tasks.length,
        users: users.length,
        projects: projects.length,
        savedAt: raw.savedAt || null,
      };
    } catch (err) {
      return { ok: false, reason: String(err && err.message ? err.message : err) };
    }
  }

  function assertMayWrite(op) {
    if (writerOfRecord !== 'ts3') {
      throw writeGateError(
        'WRITER_OF_RECORD=' +
          writerOfRecord +
          ' — refuse ts-3 sheet writes (set WRITER_OF_RECORD=ts3 for sole writer)',
        { op, writerOfRecord }
      );
    }
    if (appMode === 'production') {
      // Cutover: ts-3 is sole reader/writer. STAGING_WRITES is a staging-only latch.
      return;
    }
    if (appMode !== 'staging') {
      throw writeGateError(
        'sheet writes only when APP_MODE=staging (supervised) or production (sole writer); got ' +
          appMode,
        { op, appMode }
      );
    }
    if (!stagingWrites) {
      throw writeGateError('STAGING_WRITES=false — sheet write refused (' + op + ')', {
        op,
        stagingWrites: false,
      });
    }
  }

  function resolveAssigneeUsername(row, users) {
    const list = users || [];
    function fromLabel(label) {
      const key = String(label || '').toLowerCase().trim();
      if (!key) return '';
      for (const u of list) {
        const nu = normalizeUserSheetOnUser(u);
        if (String(nu.username || '').toLowerCase() === key) return nu.username;
        if (String(nu.displayName || '').toLowerCase() === key) return nu.username;
        if (String(nu.userSheet || '').toLowerCase() === key) return nu.username;
      }
      return '';
    }
    // Vehicle / mapping userSheet is the person of record. Master column L
    // (Assigned To) is often stuck on user-01 for old Completed rows while
    // mapping still points at Jois/Ashwin/… sheets — prefer mapping.
    const fromSheet = fromLabel(row && row.userSheet);
    if (fromSheet) return fromSheet;
    const fromAssigned = fromLabel(row && row.assignedTo);
    if (fromAssigned) return fromAssigned;
    if (row && row.assigneeUsername) return String(row.assigneeUsername).trim();
    return fromLabel(row && row.assigneeDisplayName) || '';
  }

  /**
   * Master column L is a dropdown of users-tab keys (user-01, …).
   * Keys come from the users tab — never remap by person name.
   */
  function resolveUserSheet(row, users) {
    const fromRow = canonicalUserSheet(row);
    if (fromRow) return fromRow;

    const list = users || [];
    const known = new Map();
    for (const u of list) {
      const nu = normalizeUserSheetOnUser(u);
      const us = String(nu.userSheet || '').trim();
      if (us) known.set(us.toLowerCase(), us);
    }

    function accept(candidate) {
      const c = String(candidate || '').trim();
      if (!c || c.toLowerCase() === 'unknown') return '';
      if (known.size) {
        const hit = known.get(c.toLowerCase());
        if (hit) return hit;
        return '';
      }
      return isMasterUserSheetKey(c) ? c : '';
    }

    const fromRaw = accept(row && row.userSheet);
    if (fromRaw) return fromRaw;
    const fromAssigned = accept(row && row.assignedTo);
    if (fromAssigned) return fromAssigned;

    const uname = String((row && row.assigneeUsername) || '')
      .trim()
      .toLowerCase();
    const label = String((row && row.assignedTo) || '')
      .trim()
      .toLowerCase();
    const display = String((row && row.assigneeDisplayName) || '')
      .trim()
      .toLowerCase();
    for (const u of list) {
      const nu = normalizeUserSheetOnUser(u);
      const us = accept(nu.userSheet);
      if (!us) continue;
      if (uname && String(nu.username || '').toLowerCase() === uname) return us;
      if (display && String(nu.displayName || '').toLowerCase() === display) return us;
      if (label && String(nu.displayName || '').toLowerCase() === label) return us;
      if (label && String(nu.username || '').toLowerCase() === label) return us;
      if (label && us.toLowerCase() === label) return us;
    }
    return '';
  }

  function applyDepotRows(rows, users) {
    const state = inner._state;
    state.depot.length = 0;
    Object.keys(state.vehicle).forEach((k) => delete state.vehicle[k]);
    Object.keys(state.mapping).forEach((k) => delete state.mapping[k]);
    if (state.byRef) Object.keys(state.byRef).forEach((k) => delete state.byRef[k]);
    let accepted = 0;
    let skipped = 0;
    for (const raw of rows || []) {
      const base = normalizeSheetTaskRow(raw);
      if (!base) {
        skipped += 1;
        continue;
      }
      const assigneeUsername =
        resolveAssigneeUsername(
          { ...base, assignedTo: raw && raw.assignedTo },
          users
        ) || base.assigneeUsername;
      const userSheet = resolveUserSheet(
        {
          ...base,
          assigneeUsername,
          assignedTo: raw && raw.assignedTo,
        },
        users
      );
      let assigneeDisplayName = base.assigneeDisplayName || '';
      if (isMasterUserSheetKey(assigneeDisplayName)) assigneeDisplayName = '';
      const assignedTo = String((raw && raw.assignedTo) || '').trim();
      // Resolve display name from assignee username / mapping sheet / Column L.
      if (assigneeUsername || userSheet || assignedTo) {
        const hit = (users || []).find((u) => {
          const nu = normalizeUserSheetOnUser(u);
          if (assigneeUsername
            && String(nu.username || '').toLowerCase()
              === String(assigneeUsername).toLowerCase()) {
            return true;
          }
          if (userSheet
            && String(nu.userSheet || '').toLowerCase()
              === String(userSheet).toLowerCase()) {
            return true;
          }
          if (assignedTo
            && String(nu.userSheet || '').toLowerCase()
              === assignedTo.toLowerCase()) {
            return true;
          }
          return false;
        });
        if (hit && hit.displayName) assigneeDisplayName = hit.displayName;
      }
      const r = { ...base, assigneeUsername, userSheet, assigneeDisplayName };
      if (!r.taskId || !validate(r.taskId)) {
        skipped += 1;
        continue;
      }
      state.depot.push(JSON.parse(JSON.stringify(r)));
      const sheet = r.userSheet || 'unknown';
      if (!state.vehicle[sheet]) state.vehicle[sheet] = [];
      state.vehicle[sheet].push(JSON.parse(JSON.stringify(r)));
      const ref = refFor(r.taskId, refSecret);
      state.mapping[r.taskId] = {
        taskId: r.taskId,
        ref,
        userSheet: sheet,
        assigneeUsername: r.assigneeUsername,
      };
      if (state.byRef) state.byRef[ref] = r.taskId;
      accepted += 1;
    }
    return { accepted, skipped };
  }

  function applyUsers(rawUsers) {
    const state = inner._state;
    const next = [];
    for (const raw of rawUsers || []) {
      const u = normalizeSheetUserRow(raw);
      if (u) next.push(normalizeUserSheetOnUser(u));
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
   * Snapshot taskIds that are completion-approved in the live mirror or pending outbox.
   * Used so a flaky bridge hydrate cannot demote Approved → open work.
   */
  function collectApprovedSnapshot() {
    const map = new Map();
    for (const t of inner.listDepot()) {
      if (hasTaskApprovedMark(t.notes)) {
        map.set(t.taskId, {
          notes: t.notes,
          status: 'Done',
          userSheet: t.userSheet,
        });
      }
    }
    if (outbox && typeof outbox._all === 'function') {
      for (const item of outbox._all()) {
        if (!item || !item.row) continue;
        if (item.status === 'synced' || item.status === 'dead') continue;
        if (!hasTaskApprovedMark(item.row.notes)) continue;
        map.set(item.taskId || item.row.taskId, {
          notes: ensureTaskApprovedMark(item.row.notes),
          status: 'Done',
          userSheet: item.row.userSheet || item.userSheet,
        });
      }
    }
    return map;
  }

  /** Re-apply completion approval after depot replace (Master+mirror must stay Completed/Approved). */
  function restoreApprovedSnapshot(prior) {
    if (!prior || !prior.size) return 0;
    const state = inner._state;
    let restored = 0;
    for (const t of state.depot) {
      const snap = prior.get(t.taskId);
      if (!snap) continue;
      const already =
        normalizeStatus(t.status) === 'Done' && hasTaskApprovedMark(t.notes);
      if (already) continue;
      t.status = 'Done';
      t.notes = ensureTaskApprovedMark(snap.notes || t.notes);
      restored += 1;
      const sheet = t.userSheet || 'unknown';
      if (state.vehicle[sheet]) {
        const vi = state.vehicle[sheet].findIndex((x) => x.taskId === t.taskId);
        if (vi >= 0) state.vehicle[sheet][vi] = JSON.parse(JSON.stringify(t));
      }
    }
    if (restored) {
      log.warn('restored completion-approved marks after hydrate', { restored });
    }
    return restored;
  }

  /**
   * Hydrate mirror from live bridge.
   * Successful empty depot clears fixture tasks (honest live truth).
   * Bridge failure keeps prior mirror and reports ok:false.
   * Completion-approved rows are sticky across hydrate flaps.
   */
  async function refreshFromBridge() {
    if (!useLiveBridge) return { ok: false, reason: 'bridge off' };
    try {
      const priorApproved = collectApprovedSnapshot();
      // Serialize Master reads — Apps Script chokes on parallel full-tab pulls.
      const usersRes = await bridge.getUsers().catch((err) => {
        log.warn('bridge getUsers failed', { err: String(err && err.message) });
        return null;
      });
      const projectsRes = await bridge.getProjects().catch((err) => {
        log.warn('bridge getProjects failed', { err: String(err && err.message) });
        return null;
      });
      const depotRes = await bridge.getDepot();
      const rows = (depotRes && (depotRes.rows || depotRes.tasks)) || [];
      if (!Array.isArray(rows)) return { ok: false, reason: 'bad depot payload' };

      const usersApplied = usersRes
        ? applyUsers(usersRes.users || usersRes.rows || [])
        : { replaced: false, count: inner._state.users.length };
      const projectsApplied = projectsRes
        ? applyProjects(projectsRes.projects || projectsRes.rows || [])
        : { replaced: false, count: inner._state.projects.length };

      const depotApplied = applyDepotRows(rows, inner._state.users);
      const restored = restoreApprovedSnapshot(priorApproved);
      if (!rows.length) {
        log.warn('bridge getDepot returned 0 rows — mirror depot cleared');
      }
      log.info('bridge refresh ok', {
        depot: depotApplied.accepted,
        skipped: depotApplied.skipped,
        users: usersApplied.count,
        projects: projectsApplied.count,
        restoredApproved: restored,
      });
      saveMirrorCache();
      return {
        ok: true,
        rows: depotApplied.accepted,
        skipped: depotApplied.skipped,
        users: usersApplied.count,
        projects: projectsApplied.count,
        restoredApproved: restored,
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
      const users = inner.listUsers();
      const userSheet = resolveUserSheet(row, users) || row.userSheet;
      // Bridge writes K Status as-is — emit ts-3 vocabulary (Active/Done/Pause/…).
      const sheetRow = toSheetWriteRow({ ...row, userSheet }, { birth: true });
      const vehicleRes = await bridge.writeVehicle({ row: sheetRow, birth: true });
      const depotRes = await bridge.writeDepot({ row: sheetRow, birth: true });
      const vData = (vehicleRes && vehicleRes.data) || vehicleRes || {};
      const dData = (depotRes && depotRes.data) || depotRes || {};
      const userRow = Number(vData.userRow) || 0;
      const masterRow = Number(dData.masterRow) || 0;
      const mappingRes = await bridge.writeMapping({
        taskId: row.taskId,
        userSheet,
        assigneeUsername: row.assigneeUsername,
        masterRow,
        userRow,
      });
      if (outbox && typeof outbox.setRowCache === 'function') {
        outbox.setRowCache(row.taskId, { masterRow, userRow, userSheet });
      }
      log.info('live bridge birth ok', {
        taskId: row.taskId,
        userSheet,
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
    const users = inner.listUsers();
    const userSheet = resolveUserSheet(row, users);
    if (!userSheet || userSheet.toLowerCase() === 'unknown') {
      throw new Error(
        'cannot write task: missing users-tab key (userSheet) for assignee '
          + String(row.assigneeUsername || row.assigneeDisplayName || '')
      );
    }
    const cached = outbox && typeof outbox.getRowCache === 'function'
      ? outbox.getRowCache(row.taskId)
      : null;
    const sheetRow = toSheetWriteRow({ ...row, userSheet });
    const depotRes = await bridge.writeDepot({
      row: sheetRow,
      masterRow: cached && cached.masterRow,
    });
    const vehicleRes = await bridge.writeVehicle({
      row: sheetRow,
      userRow: cached && cached.userRow,
    });
    const dData = (depotRes && depotRes.data) || depotRes || {};
    const vData = (vehicleRes && vehicleRes.data) || vehicleRes || {};
    if (outbox && typeof outbox.setRowCache === 'function') {
      outbox.setRowCache(row.taskId, {
        masterRow: Number(dData.masterRow) || (cached && cached.masterRow) || 0,
        userRow: Number(vData.userRow) || (cached && cached.userRow) || 0,
        userSheet,
      });
    }
    return { ok: true };
  }

  function enqueueLive(op, saved) {
    if (!useLiveBridge) {
      return saved;
    }
    // Production births: await bridge so a crash cannot drop a minted Task ID.
    if (outboxAwaitBirth && op === 'birth') {
      return pushLiveBirth(saved).then(() => {
        saved.syncStatus = 'synced';
        return saved;
      });
    }
    // Completion Approved must land on Master + user sheet before the API
    // returns — otherwise free-tier restarts demote Approved back to open work.
    if (
      op === 'patch'
      && hasTaskApprovedMark(saved && saved.notes)
      && normalizeStatus(saved && saved.status) === 'Done'
    ) {
      return pushLivePatch(saved)
        .then(() => {
          saved.syncStatus = 'synced';
          return saved;
        })
        .catch((err) => {
          log.warn('completion-approve sheet flush failed — queueing retry', {
            taskId: saved && saved.taskId,
            err: String(err && err.message),
          });
          if (outbox && typeof outbox.enqueue === 'function') {
            try {
              const users = inner.listUsers();
              const userSheet = resolveUserSheet(saved, users) || saved.userSheet;
              outbox.enqueue({
                op: 'patch',
                taskId: saved.taskId,
                userSheet,
                row: { ...saved, userSheet },
              });
              saved.syncStatus = 'pending';
              // Mirror already has ⟦TASK_APPROVED⟧; hydrate restore + outbox keep it sticky.
              return saved;
            } catch (enqErr) {
              log.warn('completion-approve outbox enqueue failed', {
                err: String(enqErr && enqErr.message),
              });
            }
          }
          throw err;
        });
    }
    if (!outbox || typeof outbox.enqueue !== 'function') {
      if (op === 'birth') {
        return pushLiveBirth(saved).then(() => {
          saved.syncStatus = 'synced';
          return saved;
        });
      }
      return pushLivePatch(saved).then(() => {
        saved.syncStatus = 'synced';
        return saved;
      });
    }
    const users = inner.listUsers();
    const userSheet = resolveUserSheet(saved, users) || saved.userSheet;
    try {
      outbox.enqueue({
        op,
        taskId: saved.taskId,
        userSheet,
        row: { ...saved, userSheet },
      });
      saved.syncStatus = 'pending';
    } catch (err) {
      log.warn('outbox enqueue failed — falling back to sync bridge', {
        op,
        err: String(err && err.message),
      });
      // Fall back to blocking bridge so we do not silently drop writes
      if (op === 'birth') {
        return pushLiveBirth(saved).then(() => {
          saved.syncStatus = 'synced';
          return saved;
        });
      }
      return pushLivePatch(saved).then(() => {
        saved.syncStatus = 'synced';
        return saved;
      });
    }
    return saved;
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
    loadMirrorCache,
    saveMirrorCache,

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
     * Mirror birth instantly; Sheets sync via outbox (write-behind).
     * Without outbox, keeps legacy await-bridge behavior.
     * @returns {object|Promise<object>}
     */
    commitBirth: (row) =>
      gateWrite('commitBirth', () => {
        const saved = inner.commitBirth(row);
        if (!useLiveBridge) return saved;
        if (outbox) return enqueueLive('birth', saved);
        return pushLiveBirth(saved)
          .then(() => {
            saved.syncStatus = 'synced';
            return saved;
          })
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
        if (outbox) return enqueueLive('patch', saved);
        return pushLivePatch(saved)
          .then(() => {
            saved.syncStatus = 'synced';
            return saved;
          })
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
        if (outbox) return enqueueLive('patch', saved);
        return pushLivePatch(saved)
          .then(() => {
            saved.syncStatus = 'synced';
            return saved;
          })
          .catch((err) => {
            throw err;
          });
      }),
    reassignByTaskId: (id, a, u) =>
      gateWrite('reassignByTaskId', () => {
        const saved = inner.reassignByTaskId(id, a, u);
        if (!useLiveBridge || !saved || !outbox) return saved;
        return enqueueLive('patch', saved);
      }),
    deleteByTaskId: (id) => gateWrite('deleteByTaskId', () => inner.deleteByTaskId(id)),
    deleteByRef: (r) => gateWrite('deleteByRef', () => inner.deleteByRef(r)),

    getMapping: (id) => inner.getMapping(id),
    partitionsFor: (id) => inner.partitionsFor(id),
    refFor: (tid) => inner.refFor(tid),

    /** Used by sync worker — flush one outbox row to Sheets. */
    pushLiveBirth,
    pushLivePatch,
    resolveUserSheet: (row) => resolveUserSheet(row, inner.listUsers()),

    _outbox: outbox,
    _state: inner._state,
    _unsafeMemory: () => inner._state,
  };
}

module.exports = { createSheetsData, loadFixture };
