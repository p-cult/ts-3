/**
 * ts-3 thin Apps Script bridge (deploy separately — never edit ts-2).
 *
 * Env / Script Properties:
 *   BRIDGE_SECRET — shared bearer token
 *   MASTER_ID     — master spreadsheet id (same live master as ts-2 at cutover)
 *
 * Actions: ping | getDepot | getVehicle | getProjects | getUsers
 *          writeVehicle | writeDepot | writeMapping
 *
 * Writes should only be invoked when middleware has STAGING_WRITES=true.
 * This file stays thin: no mint, no identity guard, no business rules.
 *
 * Live layout (same as ts-2 Master): header row 10, data from row 11.
 * Task tabs A–N: Id · Project · Name · Desc · Notes · Priority · Link · Start · End ·
 *                Versions · Status · Assigned To · Journal · Classifier
 */

var BRIDGE_SECRET = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET') || '';
var MASTER_ID = PropertiesService.getScriptProperties().getProperty('MASTER_ID') || '';

var HEADER_ROW = 10;
var DATA_ROW = 11;

function doPost(e) {
  try {
    var auth = (e && e.parameter && e.parameter.token) || headerBearer_(e);
    if (!BRIDGE_SECRET || auth !== BRIDGE_SECRET) {
      return json_({ ok: false, error: 'unauthorized' });
    }
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = String(body.action || '');
    if (action === 'ping') return json_({ ok: true, action: 'ping', master: !!MASTER_ID });
    if (action === 'getDepot') return json_({ ok: true, rows: readDepot_() });
    if (action === 'getVehicle') {
      return json_({
        ok: true,
        userSheet: body.userSheet,
        rows: readVehicle_(body.userSheet),
      });
    }
    if (action === 'getProjects') return json_({ ok: true, projects: readProjects_() });
    if (action === 'getUsers') return json_({ ok: true, users: readUsers_() });
    if (action === 'writeVehicle' || action === 'writeDepot' || action === 'writeMapping') {
      return json_({ ok: false, error: 'writes disabled in stub until Staging write slice' });
    }
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function headerBearer_(e) {
  try {
    if (e && e.postData && e.postData.contents) {
      var b = JSON.parse(e.postData.contents);
      if (b && b.token) return String(b.token);
    }
  } catch (ignore) {}
  return '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function master_() {
  if (!MASTER_ID) throw new Error('MASTER_ID not set');
  return SpreadsheetApp.openById(MASTER_ID);
}

function sheet_(ss, name) {
  var sh = ss.getSheetByName(name);
  if (!sh) throw new Error('missing tab: ' + name);
  return sh;
}

function cell_(row, i) {
  var v = row[i];
  return v == null ? '' : String(v).trim();
}

function dataRows_(values) {
  if (!values || !values.length) return [];
  var out = [];
  for (var i = DATA_ROW - 1; i < values.length; i++) {
    var row = values[i] || [];
    var any = false;
    for (var c = 0; c < row.length; c++) {
      if (String(row[c] == null ? '' : row[c]).trim()) {
        any = true;
        break;
      }
    }
    if (any) out.push(row);
  }
  return out;
}

function readDisplay_(sh, a1) {
  return sh.getRange(a1).getDisplayValues();
}

function mappingByTaskId_() {
  var ss = master_();
  var sh = ss.getSheetByName('mapping');
  var map = {};
  if (!sh) return map;
  var last = Math.max(sh.getLastRow(), DATA_ROW);
  var values = readDisplay_(sh, 'A1:D' + last);
  dataRows_(values).forEach(function (row) {
    var taskId = cell_(row, 0);
    if (!taskId) return;
    map[taskId] = {
      taskId: taskId,
      masterRow: Number(cell_(row, 1)) || 0,
      userSheet: cell_(row, 2),
      userRow: Number(cell_(row, 3)) || 0,
    };
  });
  return map;
}

function rowToTask_(row, mapEntry) {
  var taskId = cell_(row, 0);
  if (!taskId) return null;
  var m = mapEntry || {};
  return {
    taskId: taskId,
    project: cell_(row, 1),
    projectName: cell_(row, 1),
    name: cell_(row, 2),
    description: cell_(row, 3),
    notes: cell_(row, 4),
    priority: cell_(row, 5),
    link: cell_(row, 6),
    startDate: cell_(row, 7),
    endDate: cell_(row, 8),
    versions: cell_(row, 9),
    status: cell_(row, 10),
    assignedTo: cell_(row, 11),
    journal: cell_(row, 12),
    classifier: cell_(row, 13),
    userSheet: m.userSheet || '',
  };
}

function readDepot_() {
  var ss = master_();
  var sh = sheet_(ss, 'task');
  var last = Math.max(sh.getLastRow(), DATA_ROW);
  var values = readDisplay_(sh, 'A1:N' + last);
  var map = mappingByTaskId_();
  var out = [];
  dataRows_(values).forEach(function (row) {
    var t = rowToTask_(row, map[cell_(row, 0)]);
    if (t) out.push(t);
  });
  return out;
}

function findUserSheetMeta_(userSheet) {
  var want = String(userSheet || '').trim().toLowerCase();
  if (!want) return null;
  var users = readUsers_();
  for (var i = 0; i < users.length; i++) {
    if (String(users[i].userSheet || '').toLowerCase() === want) return users[i];
  }
  return null;
}

function readVehicle_(userSheet) {
  var meta = findUserSheetMeta_(userSheet);
  if (!meta || !meta.sheetId) return [];
  var ss = SpreadsheetApp.openById(meta.sheetId);
  var sh = ss.getSheetByName('task');
  if (!sh) return [];
  var last = Math.max(sh.getLastRow(), DATA_ROW);
  var values = readDisplay_(sh, 'A1:N' + last);
  var out = [];
  dataRows_(values).forEach(function (row) {
    var t = rowToTask_(row, { userSheet: meta.userSheet });
    if (t) {
      t.userSheet = meta.userSheet;
      t.assigneeUsername = meta.username || '';
      out.push(t);
    }
  });
  return out;
}

function readProjects_() {
  var ss = master_();
  var sh = sheet_(ss, 'admin');
  var last = Math.max(sh.getLastRow(), DATA_ROW);
  var values = readDisplay_(sh, 'A1:B' + last);
  var out = [];
  dataRows_(values).forEach(function (row) {
    var a = cell_(row, 0);
    var b = cell_(row, 1);
    if (!a) return;
    // Schema: A=ProjectCode B=ProjectName · ts-2 live: A=Name B=BaseCode
    if (/^[A-Za-z0-9]{6}$/.test(a) && b) {
      out.push({ code: a.toUpperCase(), name: b, base: a.toUpperCase() });
    } else if (/^[A-Za-z0-9]{6}$/.test(b)) {
      out.push({ code: b.toUpperCase(), name: a, base: b.toUpperCase() });
    }
  });
  return out;
}

function readUsers_() {
  var ss = master_();
  var sh = sheet_(ss, 'users');
  var last = Math.max(sh.getLastRow(), DATA_ROW);
  var values = readDisplay_(sh, 'A1:J' + last);
  var out = [];
  dataRows_(values).forEach(function (row) {
    var employeeId = cell_(row, 2);
    var userSheet = cell_(row, 0);
    if (!employeeId && !userSheet) return;
    var assignee = cell_(row, 3);
    var username = cell_(row, 6);
    out.push({
      userSheet: userSheet,
      sheetId: cell_(row, 1),
      employeeId: employeeId,
      assignee: assignee,
      displayName: String(assignee || '').split('|')[0].trim() || userSheet || username,
      status: cell_(row, 4),
      username: username || userSheet,
      password: cell_(row, 7),
      profile: Number(cell_(row, 8)) || 0,
    });
  });
  return out;
}
