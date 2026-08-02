'use strict';

/**
 * Task status — ts-3 vocabulary in the app API.
 * Shared Master sheet column K uses live dropdown words; see
 * `serializeStatusForSheet` in data/sheet-row.js and docs/SHEET-STATUS-CONTRACT.md.
 *
 *   App:   Draft | Active | Blocked | Done | Pause | Resume
 *   Sheet: Assigned | Pause | Rejected | Completed | Approved  (+ legacy Ongoing…)
 */

const ALL_STATUSES = Object.freeze([
  'Draft',
  'Active',
  'Blocked',
  'Done',
  'Pause',
  'Resume',
]);

/** P2 allow-list. */
const USER_STATUSES = Object.freeze(['Pause', 'Resume', 'Done']);

/** Legacy sheet / import aliases → ts-3. */
const STATUS_ALIASES = Object.freeze({
  // ts-2 sheet
  assigned: 'Active',
  new: 'Active',
  open: 'Active',
  ongoing: 'Active',
  'in progress': 'Active',
  inprogress: 'Active',
  wip: 'Active',
  revision: 'Active',
  paused: 'Pause',
  hold: 'Pause',
  'on hold': 'Pause',
  completed: 'Done',
  complete: 'Done',
  finished: 'Done',
  approved: 'Done', // completion-approved signal handled via notes mark on read
  rejected: 'Blocked',
  // ts-3 identity + lowercase
  draft: 'Draft',
  active: 'Active',
  blocked: 'Blocked',
  done: 'Done',
  pause: 'Pause',
  resume: 'Resume',
});

function normalizeStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return 'Active';
  const mapped = STATUS_ALIASES[s.toLowerCase()];
  return mapped || s;
}

/** API write: only exact ts-3 tokens (case-insensitive). Rejects sheet aliases. */
function coerceApiStatus(raw) {
  const s = String(raw || '').trim();
  if (!s) return null;
  const hit = ALL_STATUSES.find((x) => x.toLowerCase() === s.toLowerCase());
  return hit || null;
}

/**
 * Write path: always ts-3. Birth defaults empty → Active.
 * @param {string} canonical
 * @param {{ birth?: boolean }=} opts
 */
function serializeStatus(canonical, opts) {
  const o = opts || {};
  const s = String(canonical || '').trim();
  if (!s) return 'Active';
  const n = normalizeStatus(s);
  // Prefer Active for birth (not Draft)
  if (o.birth && (n === 'Draft' || n === 'Active' || n === 'Resume')) return 'Active';
  return n;
}

function isFinishedStatus(status) {
  return normalizeStatus(status) === 'Done';
}

/** Filter helper: UI “Active” means Active or Resume (resume displays as Active). */
function statusMatchesFilter(stored, filter) {
  const want = normalizeStatus(filter);
  const have = normalizeStatus(stored);
  if (want === 'Active') return have === 'Active' || have === 'Resume';
  return have === want;
}

/** Sheet "Approved" raw value — callers use this before normalize collapses it. */
function isRawSheetApproved(raw) {
  return /^approved$/i.test(String(raw || '').trim());
}

module.exports = {
  ALL_STATUSES,
  USER_STATUSES,
  normalizeStatus,
  coerceApiStatus,
  serializeStatus,
  isFinishedStatus,
  statusMatchesFilter,
  isRawSheetApproved,
};
