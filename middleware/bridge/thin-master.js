'use strict';

/**
 * Speak the live ts-2 thin bridge (read | write | listen | react | readMany)
 * while exposing the ts-3 semantic surface (getDepot | getUsers | …).
 *
 * Pure sheet→row helpers are exported for unit tests.
 */

const HEADER_ROW = 10;
const DATA_ROW = 11;

const { taskRowToCells } = require('../data/sheet-row');

function cell(row, i) {
  const v = row && row[i];
  return v == null ? '' : String(v).trim();
}

function rowHasAny(row) {
  if (!row || !row.length) return false;
  for (let i = 0; i < row.length; i++) {
    if (cell(row, i)) return true;
  }
  return false;
}

/** Skip header rows 1..(DATA_ROW-1); keep non-empty data rows. */
function dataRows(values) {
  if (!values || !values.length) return [];
  const out = [];
  for (let i = DATA_ROW - 1; i < values.length; i++) {
    const row = values[i] || [];
    if (rowHasAny(row)) out.push(row);
  }
  return out;
}

function mappingByTaskId(values) {
  const map = Object.create(null);
  for (const row of dataRows(values)) {
    const taskId = cell(row, 0);
    if (!taskId) continue;
    map[taskId] = {
      taskId,
      masterRow: Number(cell(row, 1)) || 0,
      userSheet: cell(row, 2),
      userRow: Number(cell(row, 3)) || 0,
    };
  }
  return map;
}

function rowToTaskObject(row, mapEntry) {
  const taskId = cell(row, 0);
  if (!taskId) return null;
  const m = mapEntry || {};
  return {
    taskId,
    project: cell(row, 1),
    projectName: cell(row, 1),
    name: cell(row, 2),
    description: cell(row, 3),
    notes: cell(row, 4),
    priority: cell(row, 5),
    link: cell(row, 6),
    startDate: cell(row, 7),
    endDate: cell(row, 8),
    versions: cell(row, 9),
    status: cell(row, 10),
    assignedTo: cell(row, 11),
    journal: cell(row, 12),
    classifier: cell(row, 13),
    userSheet: m.userSheet || '',
    masterRow: m.masterRow || 0,
    userRow: m.userRow || 0,
  };
}

function buildDepotRows(taskValues, mappingValues) {
  const map = mappingByTaskId(mappingValues);
  const out = [];
  for (const row of dataRows(taskValues)) {
    const t = rowToTaskObject(row, map[cell(row, 0)]);
    if (t) out.push(t);
  }
  return out;
}

function buildUserObjects(values) {
  const out = [];
  for (const row of dataRows(values)) {
    const employeeId = cell(row, 2);
    const userSheet = cell(row, 0);
    if (!employeeId && !userSheet) continue;
    const assignee = cell(row, 3);
    const username = cell(row, 6);
    out.push({
      userSheet,
      sheetId: cell(row, 1),
      employeeId,
      assignee,
      displayName: String(assignee || '').split('|')[0].trim() || userSheet || username,
      status: cell(row, 4),
      username: username || userSheet,
      password: cell(row, 7),
      profile: Number(cell(row, 8)) || 0,
    });
  }
  return out;
}

function buildProjectObjects(values) {
  const out = [];
  for (const row of dataRows(values)) {
    const code = cell(row, 3);
    const label = cell(row, 4);
    const project = cell(row, 0);
    const base = cell(row, 1);
    const pseudo = cell(row, 5);
    const active = cell(row, 7);
    if (/^[A-Za-z0-9]{6}$/.test(code) && (label || project)) {
      if (active && String(active).toLowerCase() !== 'yes') continue;
      out.push({
        code: code.toUpperCase(),
        name: label || project,
        base,
        label: label || project,
        pseudoName: pseudo,
      });
      continue;
    }
    const a = cell(row, 0);
    const b = cell(row, 1);
    if (!a) continue;
    if (/^[A-Za-z0-9]{6}$/.test(a) && b) {
      out.push({ code: a.toUpperCase(), name: b, base: a.toUpperCase() });
    } else if (/^[A-Za-z0-9]{6}$/.test(b)) {
      out.push({ code: b.toUpperCase(), name: a, base: b.toUpperCase() });
    }
  }
  return out;
}

/** 1-based sheet row for Task Id in a column-A slice starting at startRow, or 0. */
function findRowByTaskIdFrom(values, taskId, startRow) {
  const want = String(taskId || '').trim();
  const start = Number(startRow) || DATA_ROW;
  if (!want || !values) return 0;
  for (let i = 0; i < values.length; i++) {
    if (cell(values[i], 0) === want) return start + i;
  }
  return 0;
}

/** First empty A cell in a column-A slice starting at startRow. */
function firstEmptyRowFrom(values, startRow) {
  const start = Number(startRow) || DATA_ROW;
  const list = values || [];
  for (let i = 0; i < list.length; i++) {
    if (!cell(list[i], 0)) return start + i;
  }
  return start + list.length;
}

/** 1-based sheet row for Task Id in a full-tab values array (row 1 = values[0]), or 0. */
function findRowByTaskId(values, taskId) {
  const want = String(taskId || '').trim();
  if (!want || !values) return 0;
  for (let i = DATA_ROW - 1; i < values.length; i++) {
    if (cell(values[i], 0) === want) return i + 1;
  }
  return 0;
}

/** First empty A cell ≥ DATA_ROW, else append after last used. */
function firstEmptyRow(values) {
  if (!values || !values.length) return DATA_ROW;
  // values[0] is sheet row 1 when full-tab read
  if (values.length >= DATA_ROW) {
    for (let i = DATA_ROW - 1; i < values.length; i++) {
      if (!cell(values[i], 0)) return i + 1;
    }
    return values.length + 1;
  }
  return firstEmptyRowFrom(values, DATA_ROW);
}

/**
 * @param {{ call: Function, masterId: string, log?: object }} deps
 */
function createThinMasterApi(deps) {
  const call = deps.call;
  const masterId = String(deps.masterId || '').trim();
  const log = deps.log || { debug() {}, warn() {} };

  if (!masterId) {
    throw new Error('thin bridge needs masterSheetId / MASTER_ID');
  }

  /**
   * Master reads/writes must omit spreadsheetId — the live thin Apps Script
   * uses its hardcoded MASTER_ID (always allowlisted). Sending Render's
   * MASTER_ID when it drifts (newline, typo, old id) yields:
   * "sheet not in allowlist".
   * User sheets still send spreadsheetId (must be on the script allowlist).
   */
  function withSheetId(payload, spreadsheetId) {
    const sid = String(spreadsheetId || '').trim();
    if (sid && sid !== masterId) {
      return { ...payload, spreadsheetId: sid };
    }
    return { ...payload };
  }

  async function readTab(tab, range) {
    const payload = { action: 'read', tab };
    if (range) payload.range = range;
    const r = await call(payload.action, payload);
    const data = (r && r.data) || r || {};
    return data.values || [];
  }

  async function readMany(reads) {
    const list = (reads || []).map((r) => ({
      spreadsheetId: r.spreadsheetId || masterId,
      tab: r.tab,
      range: r.range,
    }));
    try {
      const r = await call('readMany', { reads: list });
      const data = (r && r.data) || r || {};
      if (data && Array.isArray(data.results)) return data.results;
      if (Array.isArray(data)) return data;
      throw new Error('readMany unexpected shape');
    } catch (err) {
      const msg = String((err && err.message) || '');
      if (!/unknown action/i.test(msg)) throw err;
      log.warn('bridge readMany missing — parallel read fallback');
      return Promise.all(
        list.map((item) =>
          call('read', item)
            .then((res) => ({ ok: true, data: (res && res.data) || res }))
            .catch((e) => ({ ok: false, error: String(e && e.message) }))
        )
      );
    }
  }

  async function writeTab(spreadsheetId, tab, range, values) {
    return call(
      'write',
      withSheetId({ tab, range, values }, spreadsheetId)
    );
  }

  async function getDepot() {
    // Prefer two sequential reads over readMany — large Masters time out / HTML-error
    // when Apps Script batches fat tabs in one execution.
    // Omit spreadsheetId — use Apps Script MASTER_ID (see readTab).
    const taskRes = await call('read', { tab: 'task' });
    const mapRes = await call('read', { tab: 'mapping' }).catch((err) => {
      log.warn('mapping tab read failed — depot without userSheet join', {
        err: String(err && err.message),
      });
      return null;
    });
    const taskValues = ((taskRes && taskRes.data) || taskRes || {}).values || [];
    const mapValues = mapRes ? (((mapRes && mapRes.data) || mapRes || {}).values || []) : [];
    return { ok: true, rows: buildDepotRows(taskValues, mapValues), protocol: 'thin' };
  }

  let usersCache = null;
  let usersCacheAt = 0;
  const USERS_TTL_MS = 120000;

  async function getUsers() {
    const now = Date.now();
    if (usersCache && now - usersCacheAt < USERS_TTL_MS) {
      return { ok: true, users: usersCache, protocol: 'thin', cached: true };
    }
    const values = await readTab('users');
    usersCache = buildUserObjects(values);
    usersCacheAt = now;
    return { ok: true, users: usersCache, protocol: 'thin' };
  }

  async function getProjects() {
    let values;
    try {
      values = await readTab('admin');
    } catch (err) {
      log.warn('admin tab read failed, trying Projects', {
        err: String(err && err.message),
      });
      values = await readTab('Projects');
    }
    return { ok: true, projects: buildProjectObjects(values), protocol: 'thin' };
  }

  async function getVehicle(userSheet) {
    const users = (await getUsers()).users || [];
    const want = String(userSheet || '')
      .trim()
      .toLowerCase();
    const meta = users.find((u) => String(u.userSheet || '').toLowerCase() === want);
    if (!meta || !meta.sheetId) return { ok: true, userSheet, rows: [], protocol: 'thin' };
    const r = await call('read', {
      spreadsheetId: meta.sheetId,
      tab: 'task',
    });
    const values = ((r && r.data) || r || {}).values || [];
    const rows = [];
    for (const row of dataRows(values)) {
      const t = rowToTaskObject(row, { userSheet: meta.userSheet });
      if (t) {
        t.userSheet = meta.userSheet;
        t.assigneeUsername = meta.username || '';
        rows.push(t);
      }
    }
    return { ok: true, userSheet: meta.userSheet, rows, protocol: 'thin' };
  }

  async function readColA(spreadsheetId, tab) {
    const r = await call(
      'read',
      withSheetId(
        { tab, range: 'A' + DATA_ROW + ':A' },
        spreadsheetId
      )
    );
    const data = (r && r.data) || r || {};
    return data.values || [];
  }

  async function resolveWriteRow(spreadsheetId, tab, taskId, hintRow) {
    const hint = Number(hintRow) || 0;
    if (hint >= DATA_ROW) return hint;
    // Column A only — full-tab reads blow Apps Script into HTML error pages.
    const values = await readColA(spreadsheetId, tab);
    return (
      findRowByTaskIdFrom(values, taskId, DATA_ROW) ||
      firstEmptyRowFrom(values, DATA_ROW)
    );
  }

  /** Like resolveWriteRow but never falls through to a blank row (delete must hit the real line). */
  async function resolveExistingRow(spreadsheetId, tab, taskId, hintRow) {
    const hint = Number(hintRow) || 0;
    const values = await readColA(spreadsheetId, tab);
    const found = findRowByTaskIdFrom(values, taskId, DATA_ROW);
    if (found) return found;
    if (hint >= DATA_ROW) return hint;
    throw new Error('task row not found for clear: ' + taskId + ' @ ' + tab);
  }

  async function writeVehicle(payload) {
    const row = (payload && payload.row) || {};
    const userSheet = String(row.userSheet || (payload && payload.userSheet) || '').trim();
    if (!row.taskId) throw new Error('writeVehicle needs row.taskId');
    if (!userSheet) throw new Error('writeVehicle needs row.userSheet');
    const users = (await getUsers()).users || [];
    const meta = users.find(
      (u) => String(u.userSheet || '').toLowerCase() === userSheet.toLowerCase()
    );
    if (!meta || !meta.sheetId) {
      throw new Error('unknown userSheet / missing sheetId: ' + userSheet);
    }
    const n = await resolveWriteRow(
      meta.sheetId,
      'task',
      row.taskId,
      payload && payload.userRow
    );
    // User sheets are A–K (no Assigned To / Journal / Classifier).
    const cells = taskRowToCells(row, { birth: !!(payload && payload.birth) }).slice(0, 11);
    try {
      await writeTab(meta.sheetId, 'task', 'A' + n + ':K' + n, [cells]);
    } catch (err) {
      const msg = String((err && err.message) || err);
      if (/allowlist/i.test(msg)) {
        throw new Error(
          'Your sheet is not on the bridge allowlist ('
            + meta.userSheet
            + ' / '
            + meta.sheetId
            + '). Ask an admin to add this sheet ID to Apps Script ALLOWED_SHEETS.'
        );
      }
      throw err;
    }
    return { ok: true, data: { userSheet: meta.userSheet, userRow: n, sheetId: meta.sheetId } };
  }

  async function writeDepot(payload) {
    const row = (payload && payload.row) || {};
    if (!row.taskId) throw new Error('writeDepot needs row.taskId');
    const n = await resolveWriteRow(
      masterId,
      'task',
      row.taskId,
      payload && payload.masterRow
    );
    const cells = taskRowToCells(row, { birth: !!(payload && payload.birth) });
    await writeTab(masterId, 'task', 'A' + n + ':N' + n, [cells]);
    return { ok: true, data: { masterRow: n } };
  }

  /**
   * Best-effort multi-write for Apps Script. Falls back to sequential thin writes
   * when the live bridge has no writeBatch action.
   * @param {{ writes: Array<{ spreadsheetId?: string, tab: string, range: string, values: any[][] }> }} payload
   */
  async function writeBatch(payload) {
    const writes = (payload && payload.writes) || [];
    if (!writes.length) return { ok: true, data: { count: 0 } };
    try {
      const r = await call('writeBatch', { writes });
      return { ok: true, data: (r && r.data) || r || { count: writes.length }, protocol: 'thin' };
    } catch (err) {
      log.warn('writeBatch unavailable — sequential thin writes', {
        err: String(err && err.message),
        count: writes.length,
      });
      for (const w of writes) {
        await writeTab(w.spreadsheetId || masterId, w.tab, w.range, w.values);
      }
      return { ok: true, data: { count: writes.length, fallback: 'sequential' } };
    }
  }

  async function writeMapping(payload) {
    const taskId = String((payload && payload.taskId) || '').trim();
    const userSheet = String((payload && payload.userSheet) || '').trim();
    const masterRow = Number(payload && payload.masterRow) || 0;
    const userRow = Number(payload && payload.userRow) || 0;
    if (!taskId) throw new Error('writeMapping needs taskId');
    if (!userSheet) throw new Error('writeMapping needs userSheet');
    if (!masterRow || !userRow) throw new Error('writeMapping needs masterRow and userRow');
    // Column A only — full mapping tab read was failing births with HTML 200s.
    const values = await readColA(masterId, 'mapping');
    const existing = findRowByTaskIdFrom(values, taskId, DATA_ROW);
    const target = existing || firstEmptyRowFrom(values, DATA_ROW);
    await writeTab(masterId, 'mapping', 'A' + target + ':D' + target, [
      [taskId, String(masterRow), userSheet, String(userRow)],
    ]);
    return {
      ok: true,
      data: { mappingRow: target, taskId, masterRow, userRow, userSheet },
    };
  }

  /**
   * Clear Master task + user vehicle + mapping cells for a Task ID so rehydrate
   * cannot resurrect a “deleted” board row.
   */
  async function clearTaskSheets(payload) {
    const taskId = String((payload && payload.taskId) || '').trim();
    if (!taskId) throw new Error('clearTaskSheets needs taskId');
    const userSheet = String((payload && payload.userSheet) || '').trim();
    const masterHint = Number(payload && payload.masterRow) || 0;
    const userHint = Number(payload && payload.userRow) || 0;

    let masterRow = 0;
    try {
      masterRow = await resolveExistingRow(masterId, 'task', taskId, masterHint);
      await writeTab(masterId, 'task', 'A' + masterRow + ':N' + masterRow, [
        Array(14).fill(''),
      ]);
    } catch (err) {
      log.warn('clearTaskSheets Master miss', {
        taskId,
        err: String(err && err.message),
      });
    }

    let userRow = 0;
    if (userSheet) {
      const users = (await getUsers()).users || [];
      const meta = users.find(
        (u) => String(u.userSheet || '').toLowerCase() === userSheet.toLowerCase()
      );
      if (meta && meta.sheetId) {
        try {
          userRow = await resolveExistingRow(meta.sheetId, 'task', taskId, userHint);
          await writeTab(meta.sheetId, 'task', 'A' + userRow + ':K' + userRow, [
            Array(11).fill(''),
          ]);
        } catch (err) {
          log.warn('clearTaskSheets vehicle miss — continuing', {
            taskId,
            userSheet,
            err: String(err && err.message),
          });
        }
      }
    }

    const mapValues = await readColA(masterId, 'mapping');
    const mapRow = findRowByTaskIdFrom(mapValues, taskId, DATA_ROW);
    if (mapRow) {
      await writeTab(masterId, 'mapping', 'A' + mapRow + ':D' + mapRow, [
        ['', '', '', ''],
      ]);
    }

    return {
      ok: true,
      data: { taskId, masterRow, userRow, mappingRow: mapRow || 0, userSheet },
    };
  }

  async function ping() {
    const r = await call('listen', { spreadsheetIds: [masterId] });
    return { ok: true, state: 'ok', message: 'thin bridge reachable', detail: r, protocol: 'thin' };
  }

  return {
    protocol: 'thin',
    getDepot,
    getUsers,
    getProjects,
    getVehicle,
    writeVehicle,
    writeDepot,
    writeMapping,
    writeBatch,
    clearTaskSheets,
    ping,
    HEADER_ROW,
    DATA_ROW,
  };
}

module.exports = {
  HEADER_ROW,
  DATA_ROW,
  dataRows,
  buildDepotRows,
  buildUserObjects,
  buildProjectObjects,
  taskRowToCells,
  findRowByTaskId,
  findRowByTaskIdFrom,
  firstEmptyRow,
  firstEmptyRowFrom,
  createThinMasterApi,
};
