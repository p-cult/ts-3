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
 * This file stays thin: no business rules, no mint, no identity guard.
 */

var BRIDGE_SECRET = PropertiesService.getScriptProperties().getProperty('BRIDGE_SECRET') || '';
var MASTER_ID = PropertiesService.getScriptProperties().getProperty('MASTER_ID') || '';

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
    if (action === 'getDepot') return json_({ ok: true, rows: readTaskTab_('depot') });
    if (action === 'getVehicle') {
      return json_({ ok: true, userSheet: body.userSheet, rows: readTaskTab_(body.userSheet) });
    }
    if (action === 'getProjects') return json_({ ok: true, projects: readProjects_() });
    if (action === 'getUsers') return json_({ ok: true, users: readUsers_() });
    if (action === 'writeVehicle' || action === 'writeDepot' || action === 'writeMapping') {
      // Middleware must gate STAGING_WRITES; bridge still requires a locked write helper.
      return json_({ ok: false, error: 'writes disabled in stub until Staging write slice' });
    }
    return json_({ ok: false, error: 'unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

function headerBearer_(e) {
  // Apps Script web apps expose limited headers; token also accepted in JSON body.token
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

/** Placeholder readers — replace with real A:J tab scans when wiring live master. */
function readTaskTab_(which) {
  void which;
  return [];
}
function readProjects_() {
  return [];
}
function readUsers_() {
  return [];
}
