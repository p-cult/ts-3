'use strict';

/**
 * Task kinds — pure.
 * main | sub | pseudo | routine | not_a_task
 */

const KINDS = Object.freeze([
  'main',
  'sub',
  'pseudo',
  'routine',
  'not_a_task',
]);

const LEARNABLE = Object.freeze(['pseudo', 'routine', 'not_a_task']);
const BOARD_PUBLIC = Object.freeze(['main', 'sub']); // public hierarchy
const STAGEABLE = Object.freeze(['main', 'sub']);
const REVIEWABLE = Object.freeze(['main', 'sub']);

function normalizeKind(k) {
  const s = String(k || 'main').trim().toLowerCase();
  if (KINDS.includes(s)) return s;
  return 'main';
}

function isRestrictedKind(k) {
  return LEARNABLE.includes(normalizeKind(k));
}

function isPublicBoardKind(k) {
  return BOARD_PUBLIC.includes(normalizeKind(k));
}

function isStageable(k) {
  return STAGEABLE.includes(normalizeKind(k));
}

function isReviewable(k) {
  return REVIEWABLE.includes(normalizeKind(k));
}

/**
 * Learning: same project + exact normalized name → inherit kind if learnable.
 * @param {object[]} depot
 * @param {{ projectCode: string, name: string }} candidate
 * @param {{ normName: Function }} helpers
 */
function learnKind(depot, candidate, helpers) {
  const pc = String(candidate.projectCode || '').toUpperCase();
  const nn = helpers.normName(candidate.name);
  if (!nn) return null;
  for (const t of depot || []) {
    if (String(t.projectCode || '').toUpperCase() !== pc) continue;
    if (helpers.normName(t.name) !== nn) continue;
    const k = normalizeKind(t.kind);
    if (LEARNABLE.includes(k)) return k;
  }
  return null;
}

function kindIcon(k) {
  const n = normalizeKind(k);
  if (n === 'pseudo') return 'P';
  if (n === 'routine') return 'R';
  if (n === 'not_a_task') return 'N';
  return '';
}

module.exports = {
  KINDS,
  LEARNABLE,
  BOARD_PUBLIC,
  STAGEABLE,
  REVIEWABLE,
  normalizeKind,
  isRestrictedKind,
  isPublicBoardKind,
  isStageable,
  isReviewable,
  learnKind,
  kindIcon,
};
