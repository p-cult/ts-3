'use strict';

/**
 * Normalize live Master / User sheet rows into middleware task shape.
 * Pure — no I/O. Matches ts-2 live layout (A–N) while staying thin.
 *
 * A Task Id · B Project · C Name · D Description · E Notes · F Priority
 * G Link · H Start · I End · J Versions · K Status · L Assigned To
 * (+ optional mapping fields already attached by the bridge)
 */

const { validate, parse } = require('../domain/taskid');

const STATUS_ALIASES = Object.freeze({
  assigned: 'Active',
  new: 'Active',
  ongoing: 'Active',
  paused: 'Pause',
  completed: 'Done',
  approved: 'Done',
  rejected: 'Blocked',
  revision: 'Active',
  draft: 'Draft',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
  pause: 'Pause',
  resume: 'Resume',
});

const PRIORITY_ALIASES = Object.freeze({
  high: 'high',
  medium: 'normal',
  normal: 'normal',
  low: 'low',
});

function cell(row, i) {
  if (Array.isArray(row)) {
    const v = row[i];
    return v == null ? '' : String(v).trim();
  }
  return '';
}

function normalizeStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Active';
  const mapped = STATUS_ALIASES[s.toLowerCase()];
  return mapped || s;
}

function normalizePriority(raw) {
  const s = String(raw || '').trim().toLowerCase();
  if (!s) return 'normal';
  return PRIORITY_ALIASES[s] || s;
}

/**
 * @param {object|string[]} input — bridge JSON object or A–N cell array
 * @param {{ userSheet?: string, assigneeUsername?: string }=} extras
 */
function normalizeSheetTaskRow(input, extras) {
  let raw;
  if (Array.isArray(input)) {
    raw = {
      taskId: cell(input, 0),
      project: cell(input, 1),
      name: cell(input, 2),
      description: cell(input, 3),
      notes: cell(input, 4),
      priority: cell(input, 5),
      link: cell(input, 6),
      startDate: cell(input, 7),
      endDate: cell(input, 8),
      versions: cell(input, 9),
      status: cell(input, 10),
      assignedTo: cell(input, 11),
      journal: cell(input, 12),
      classifier: cell(input, 13),
    };
  } else {
    raw = input || {};
  }

  const taskId = String(raw.taskId || raw.id || '').trim();
  if (!taskId || !validate(taskId)) return null;

  const projectName = String(raw.projectName || raw.project || '').trim();
  const parsed = parse(taskId);
  const ex = extras || {};
  const userSheet = String(
    raw.userSheet || ex.userSheet || ''
  ).trim() || 'unknown';
  const assigneeUsername = String(
    raw.assigneeUsername || ex.assigneeUsername || ''
  ).trim();
  const assigneeDisplayName = String(
    raw.assigneeDisplayName || raw.assignedTo || ''
  ).trim();

  let kind = String(raw.kind || 'main').toLowerCase();
  const clf = String(raw.classifier || '').toLowerCase();
  if (clf === 'pseudo' || clf === 'p') kind = 'pseudo';
  else if (clf === 'routine' || clf === 'r') kind = 'routine';
  else if (clf === 'not_a_task' || clf === 'n') kind = 'not_a_task';

  return {
    taskId,
    projectCode: (parsed && parsed.projectCode) || String(raw.projectCode || '').trim(),
    projectName,
    name: String(raw.name || '').trim(),
    description: String(raw.description || ''),
    notes: String(raw.notes || ''),
    priority: normalizePriority(raw.priority),
    link: String(raw.link || ''),
    startDate: String(raw.startDate || raw.assignedDate || ''),
    endDate: String(raw.endDate || raw.deadline || ''),
    status: normalizeStatus(raw.status),
    assigneeUsername,
    assigneeDisplayName,
    userSheet,
    kind,
    parentTaskId: raw.parentTaskId || null,
    reviewState: String(raw.reviewState || 'none').toLowerCase() || 'none',
    versions: String(raw.versions || ''),
    createdAt: raw.createdAt || null,
    updatedAt: raw.updatedAt || null,
  };
}

/**
 * admin / projects tab → { code, name }
 * Supports schema A=code B=name and ts-2 A=name B=baseCode.
 */
function normalizeSheetProjectRow(input) {
  if (Array.isArray(input)) {
    const a = cell(input, 0);
    const b = cell(input, 1);
    if (!a) return null;
    if (/^[A-Za-z0-9]{6}$/.test(a) && b) {
      return { code: a.toUpperCase(), name: b };
    }
    if (/^[A-Za-z0-9]{6}$/.test(b)) {
      return { code: b.toUpperCase(), name: a };
    }
    return null;
  }
  const code = String((input && (input.code || input.base)) || '').trim();
  const name = String((input && (input.name || input.projectName)) || '').trim();
  if (!code || !/^[A-Za-z0-9]{6}$/.test(code) || !name) return null;
  return { code: code.toUpperCase(), name };
}

/**
 * users tab → middleware user (login needs plaintext password in H when present).
 */
function normalizeSheetUserRow(input) {
  let raw;
  if (Array.isArray(input)) {
    raw = {
      userSheet: cell(input, 0),
      sheetId: cell(input, 1),
      employeeId: cell(input, 2),
      assignee: cell(input, 3),
      status: cell(input, 4),
      username: cell(input, 6),
      password: cell(input, 7),
      profile: cell(input, 8),
    };
  } else {
    raw = input || {};
  }
  const employeeId = String(raw.employeeId || '').trim();
  const userSheet = String(raw.userSheet || '').trim();
  if (!employeeId && !userSheet) return null;
  const username = String(raw.username || '').trim();
  const displayName = String(
    raw.displayName || String(raw.assignee || '').split('|')[0]
  ).trim() || userSheet || username;
  const profile = Number(raw.profile) || 0;
  return {
    username: username || userSheet,
    password: String(raw.password || ''),
    displayName,
    profile,
    employeeId,
    userSheet,
    sheetId: String(raw.sheetId || ''),
    status: String(raw.status || ''),
  };
}

module.exports = {
  normalizeSheetTaskRow,
  normalizeSheetProjectRow,
  normalizeSheetUserRow,
  normalizeStatus,
  normalizePriority,
};
