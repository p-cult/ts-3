'use strict';

/**
 * Normalize live Master / User sheet rows into middleware task shape.
 * Pure — no I/O. Matches ts-2 live layout (A–N) while staying thin.
 *
 * Status: ts-3 vocabulary on write (Active/Done/Pause/…).
 * Legacy ts-2 sheet words are accepted on read only.
 */

const { validate, parse } = require('../domain/taskid');
const {
  normalizeStatus,
  serializeStatus,
  isRawSheetApproved,
} = require('../domain/status');
const { canonicalUserSheet, isMasterUserSheetKey } = require('../domain/user-sheet');

/** Task-level completion approval marker (Done → Approved in UI; sheet still Done). */
const TASK_APPROVED_MARK = '⟦TASK_APPROVED⟧';

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

function hasTaskApprovedMark(notes) {
  return String(notes == null ? '' : notes).indexOf(TASK_APPROVED_MARK) >= 0;
}

function ensureTaskApprovedMark(notes) {
  if (hasTaskApprovedMark(notes)) return String(notes || '');
  const base = String(notes || '').trim();
  return base ? base + '\n' + TASK_APPROVED_MARK : TASK_APPROVED_MARK;
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
  // Column L is often user-01 / user-02 (dropdown key) — never treat that as a display name.
  const assignedRaw = String(raw.assignedTo || '').trim();
  let assigneeDisplayName = String(raw.assigneeDisplayName || '').trim();
  if (!assigneeDisplayName && assignedRaw && !isMasterUserSheetKey(assignedRaw)) {
    assigneeDisplayName = assignedRaw;
  }

  let kind = String(raw.kind || 'main').toLowerCase();
  const clf = String(raw.classifier || '').toLowerCase();
  if (clf === 'pseudo' || clf === 'p') kind = 'pseudo';
  else if (clf === 'routine' || clf === 'r') kind = 'routine';
  else if (clf === 'not_a_task' || clf === 'n') kind = 'not_a_task';

  const rawStatus = String(raw.status || '').trim();
  const status = normalizeStatus(rawStatus);
  let notes = String(raw.notes || '');
  // Sheet "Approved" → Done + completion mark (ts-3 has no Approved status)
  if (isRawSheetApproved(rawStatus)) {
    notes = ensureTaskApprovedMark(notes);
  }

  return {
    taskId,
    projectCode: (parsed && parsed.projectCode) || String(raw.projectCode || '').trim(),
    projectName,
    name: String(raw.name || '').trim(),
    description: String(raw.description || ''),
    notes,
    priority: normalizePriority(raw.priority),
    link: String(raw.link || ''),
    startDate: String(raw.startDate || raw.assignedDate || ''),
    endDate: String(raw.endDate || raw.deadline || ''),
    status,
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

function normalizeSheetProjectRow(input) {
  if (Array.isArray(input)) {
    const projectCode = cell(input, 3);
    const dropdown = cell(input, 4);
    const project = cell(input, 0);
    const base = cell(input, 1);
    const pseudo = cell(input, 5);
    const active = cell(input, 7);
    if (/^[A-Za-z0-9]{6}$/.test(projectCode) && (dropdown || project)) {
      if (active && !/^yes$/i.test(active)) return null;
      const out = {
        code: projectCode.toUpperCase(),
        name: dropdown || project,
      };
      if (base) out.base = base;
      if (dropdown) out.label = dropdown;
      if (pseudo) out.pseudoName = pseudo;
      return out;
    }
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
  const active = input && input.active;
  if (active === false) return null;
  if (typeof active === 'string' && active.trim() && !/^yes$/i.test(active)) return null;
  const code = String(
    (input && (input.code || input.projectCode || input.base)) || ''
  ).trim();
  const name = String(
    (input &&
      (input.name ||
        input.label ||
        input.dropdownLabel ||
        input.projectName)) ||
      ''
  ).trim();
  if (!code || !/^[A-Za-z0-9]{6}$/.test(code) || !name) return null;
  const out = { code: code.toUpperCase(), name };
  if (input.base) out.base = String(input.base).trim();
  if (input.label || input.dropdownLabel) {
    out.label = String(input.label || input.dropdownLabel).trim();
  }
  if (input.pseudoName || input.pseudo) {
    out.pseudoName = String(input.pseudoName || input.pseudo).trim();
  }
  return out;
}

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

/**
 * Middleware task row → A–N cells for live Master / user sheets.
 * Column L Assigned To MUST be the users-tab key (user-02), not display name —
 * Master has a dropdown on L that rejects anything else.
 * Status K uses live Master dropdown vocab (see serializeStatusForSheet).
 * @param {object} row
 * @param {{ birth?: boolean }=} opts
 */
function taskRowToCells(row, opts) {
  const r = row || {};
  const kind = String(r.kind || 'main').toLowerCase();
  let classifier = '';
  if (kind === 'pseudo') classifier = 'pseudo';
  else if (kind === 'routine') classifier = 'routine';
  else if (kind === 'not_a_task') classifier = 'not_a_task';

  const pri = String(r.priority || 'normal').toLowerCase();
  const priorityOut =
    pri === 'high' ? 'High' : pri === 'low' ? 'Low' : pri === 'normal' ? 'Medium' : String(r.priority || '');

  // Live Master L dropdown = user-01 / user-02 / … only (users-tab keys).
  // Never write display names or usernames into L.
  let assignedToOut = canonicalUserSheet(r);
  if (!assignedToOut) {
    const raw = String(r.userSheet || '').trim();
    if (isMasterUserSheetKey(raw)) assignedToOut = raw;
    else {
      const assigned = String(r.assignedTo || '').trim();
      assignedToOut = isMasterUserSheetKey(assigned) ? assigned : '';
    }
  }

  return [
    String(r.taskId || ''),
    String(r.projectName || r.project || r.projectCode || ''),
    String(r.name || ''),
    String(r.description || ''),
    String(r.notes || ''),
    priorityOut,
    String(r.link || ''),
    String(r.startDate || ''),
    String(r.endDate || ''),
    String(r.versions || ''),
    serializeStatusForSheet(r.status, {
      birth: !!(opts && opts.birth),
      notes: r.notes,
    }),
    assignedToOut,
    String(r.journal || ''),
    classifier,
  ];
}

/**
 * ts-3 API status → live Master column K dropdown words.
 *
 * Contract (Phase 0 / go-live):
 *   birth / Draft / Active / Resume → Assigned
 *   Pause                           → Pause
 *   Blocked                         → Rejected  (legacy sheet word; read maps back)
 *   Done (no approval mark)         → Completed
 *   Done + ⟦TASK_APPROVED⟧ in notes → Approved
 *
 * App still speaks Draft|Active|Blocked|Done|Pause|Resume; normalize on read.
 */
function serializeStatusForSheet(canonical, opts) {
  const o = opts || {};
  const n = normalizeStatus(canonical);
  if (o.birth || n === 'Draft' || n === 'Active' || n === 'Resume') return 'Assigned';
  if (n === 'Pause') return 'Pause';
  if (n === 'Blocked') return 'Rejected';
  if (n === 'Done') {
    if (o.sheetApproved || hasTaskApprovedMark(o.notes)) return 'Approved';
    return 'Completed';
  }
  const raw = String(canonical || '').trim();
  if (/^approved$/i.test(raw)) return 'Approved';
  if (/^completed$/i.test(raw)) return 'Completed';
  if (/^paused$/i.test(raw)) return 'Pause';
  if (/^rejected$/i.test(raw)) return 'Rejected';
  if (/^assigned$/i.test(raw) || /^ongoing$/i.test(raw)) return 'Assigned';
  return raw || 'Assigned';
}

function toSheetWriteRow(row, opts) {
  const r = Object.assign({}, row || {});
  r.status = serializeStatus(r.status, {
    birth: !!(opts && opts.birth),
  });
  return r;
}

module.exports = {
  TASK_APPROVED_MARK,
  normalizeSheetTaskRow,
  normalizeSheetProjectRow,
  normalizeSheetUserRow,
  normalizeStatus,
  serializeStatus,
  serializeStatusForSheet,
  toSheetWriteRow,
  hasTaskApprovedMark,
  ensureTaskApprovedMark,
  normalizePriority,
  taskRowToCells,
};
