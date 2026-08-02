/**
 * Priority engine — single truth for task priority (ported from ts-2 Charter 3).
 *
 * Clock rules (open tasks with a parseable lifetime):
 *   past deadline → high + overdue
 *   ≥80% elapsed  → high
 *   ≥40% elapsed  → medium (API: normal)
 *   else          → low
 *
 * P4 hand-set override wins while the deadline string is unchanged.
 * Vocabulary matches ts-3 API: high | normal | low (sheet Medium ↔ normal).
 */

'use strict';

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'data', 'priority-overrides.json');
const MONTHS = [
  'jan', 'feb', 'mar', 'apr', 'may', 'jun',
  'jul', 'aug', 'sep', 'oct', 'nov', 'dec',
];

/** Normalize sheet/API aliases → high | normal | low. */
function normalizePriority(raw) {
  const s = String(raw == null ? '' : raw).trim().toLowerCase();
  if (s === 'high') return 'high';
  if (s === 'low') return 'low';
  if (s === 'medium' || s === 'normal') return 'normal';
  return s ? s : 'normal';
}

/** "02-Jul | 18:30" → Date in the given year; null if unparseable. */
function parseSheetDate(s, year) {
  if (!s) return null;
  const [datePart, timePart] = String(s).split('|').map((x) => (x || '').trim());
  const bits = datePart.split('-');
  const d = parseInt(bits[0], 10);
  const m = MONTHS.indexOf(String(bits[1] || '').slice(0, 3).toLowerCase());
  if (!d || m < 0) return null;
  const t = /^(\d{1,2}):(\d{2})$/.exec(timePart || '');
  return new Date(year, m, d, t ? +t[1] : 0, t ? +t[2] : 0);
}

function isCompleted(task) {
  const st = String(task && task.status || '').trim().toLowerCase();
  return st === 'done' || st === 'completed'
    || !!(task && (task.logged || task.approved));
}

/**
 * Effective priority for one task.
 * Returns { priority, overdue, source: 'clock' | 'override' | 'stored' }.
 * `task.id` should be the stable override key (public `ref` or internal taskId).
 *
 * Past deadline always wins: high + overdue (brick red). Admin override only
 * applies while the task is still inside its deadline window.
 */
function compute(task, overrides, now) {
  now = now || new Date();
  const stored = normalizePriority(task && task.priority);
  const deadline = parseSheetDate(task && task.endDate, now.getFullYear());
  if (!deadline) return { priority: stored, overdue: false, source: 'stored' };

  if (isCompleted(task)) {
    return { priority: stored, overdue: false, source: 'stored' };
  }

  // Past deadline → always high + overdue (brick red). Beats admin override.
  if (deadline < now) {
    return { priority: 'high', overdue: true, source: 'clock' };
  }

  const key = task && (task.id || task.ref || task.taskId);
  const ov = key && overrides && overrides[key];
  if (ov && ov.deadline === String((task && task.endDate) || '')) {
    return { priority: stored, overdue: false, source: 'override' };
  }

  const start = parseSheetDate(task && task.startDate, now.getFullYear());
  if (!start || start >= deadline) {
    return { priority: stored, overdue: false, source: 'stored' };
  }
  const pctElapsed = 100 - ((deadline - now) / (deadline - start)) * 100;
  const priority = pctElapsed >= 80 ? 'high' : pctElapsed >= 40 ? 'normal' : 'low';
  return { priority, overdue: false, source: 'clock' };
}

function loadOverrides() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch (e) {
    return {};
  }
}

/** Stamp effective priority + overdue onto every task (mutates in place). */
function applyAll(tasks, now) {
  const overrides = loadOverrides();
  (tasks || []).forEach((t) => {
    const r = compute(
      {
        id: t.id || t.ref || t.taskId,
        priority: t.priority,
        status: t.status,
        startDate: t.startDate,
        endDate: t.endDate,
        logged: t.logged,
        approved: t.approved,
      },
      overrides,
      now
    );
    t.priority = r.priority;
    t.overdue = r.overdue;
    t.prioritySource = r.source;
    t.prioritySetBy =
      r.source === 'override'
        ? (overrides[t.id || t.ref || t.taskId] && overrides[t.id || t.ref || t.taskId].by) || 'admin'
        : null;
  });
  return tasks;
}

/** Record a hand-set priority, pinned to the task's current deadline. */
function recordOverride(taskId, deadline, by) {
  try {
    if (!taskId) return;
    const o = loadOverrides();
    o[taskId] = { deadline: deadline || '', by: by || 'admin' };
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(o, null, 2));
  } catch (e) {
    /* never break a save over bookkeeping */
  }
}

module.exports = {
  compute,
  applyAll,
  recordOverride,
  loadOverrides,
  parseSheetDate,
  normalizePriority,
};
